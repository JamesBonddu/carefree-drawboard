import { useCallback, useEffect, useRef } from "react";
import { computed, makeObservable, observable, runInAction } from "mobx";

import {
  FOCUS_PLUGIN_NAME,
  GUIDELINE_SYSTEM_PLUGIN_NAME,
  getRandomHash,
  Logger,
  WATERMARK_PLUGIN_NAME,
  allInternalPlugins,
  getHash,
  sleep,
} from "@carefree0910/core";
import { ABCStore, langStore } from "@carefree0910/business";

import type { IPythonOnSocketMessage, IPythonSocketRequest } from "@/schema/_python";
import { useReactPluginSettings } from "@/_settings";
import { IMAGE_PLACEHOLDER, IS_PROD } from "@/utils/constants";
import { ThemeType, allThemes, themeStore } from "@/stores/theme";
import { userStore } from "@/stores/user";
import { debugStore } from "@/stores/debug";
import { getNewUpdateTime } from "@/stores/projects";
import { ISettingsStore, settingsStore, useSettingsSynced } from "@/stores/settings";
import {
  IProject,
  getAllProjectInfo,
  getAutoSaveProject,
  getAutoSaveProjectInfo,
  getProject,
  saveProject,
  useCurrentProjectWithUserId,
} from "@/actions/manageProjects";
import { collapseAllPlugins } from "@/actions/managePlugins";
import { useWebSocketHook } from "@/requests/hooks";
import { floatingIconLoadedEvent } from "@/plugins/components/Floating";
import { authEvent, useAuth } from "./useAuth";

export function useIsSetup(): boolean {
  return !!userStore.userId && useSettingsSynced();
}
export function useIsAllReady(): boolean {
  return useIsSetup() && setupStore.isReady;
}
export function useSetup(): void {
  useAuth();
  useUserInitialization();
  useSyncPython();
  useAutoSaveEvery(60);
  useCheckIconLoaded();
  usePreloadImagePlaceholder();
}

// helper store

interface ISetupStore {
  iconLoaded: boolean;
  imagePlaceholderLoaded: boolean;
}
class SetupStore extends ABCStore<ISetupStore> implements ISetupStore {
  iconLoaded: boolean = false;
  imagePlaceholderLoaded: boolean = false;

  constructor() {
    super();
    makeObservable(this, {
      iconLoaded: observable,
      imagePlaceholderLoaded: observable,
      isReady: computed,
    });
  }

  get info(): ISetupStore {
    return this;
  }

  get isReady(): boolean {
    return this.iconLoaded && this.imagePlaceholderLoaded;
  }
}
const setupStore = new SetupStore();

// helper functions

//// prepare user information

//// generate pseudo user id and postMessage.
//// also pretend that the user id may need a few seconds to be fetched.
const postPseduoUserId = async (): Promise<void> => {
  await sleep(debugStore.pseduoWaitingTime);
  const USER_ID_KEY = "CFDRAW_USER_ID";
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = getRandomHash().toString();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  const url = IS_PROD
    ? import.meta.env.VITE_CFDRAW_API_URL
    : `http://localhost:${import.meta.env.VITE_CFDRAW_FE_PORT}`;
  window.postMessage({ userId }, url);
};
const useUserInitialization = () => {
  useEffect(() => {
    const { dispose } = authEvent.on(({ userId }) => {
      Logger.debug(`user id: ${userId}`);
      userStore.updateProperty("userId", userId);
    });
    if (debugStore.postPseduoUserId) {
      postPseduoUserId();
    }

    return dispose;
  }, []);
};

//// update settings, return `true` if settings hash is changed (which means rerendering is needed)
const updateSettings = (data: ISettingsStore): boolean => {
  const incomingHash = getHash(JSON.stringify(data)).toString();
  if (settingsStore.hash === incomingHash) return false;
  runInAction(async () => {
    settingsStore.hash = incomingHash;
    settingsStore.pluginSettings = data.pluginSettings;
    // `internalSettings` should only be updated once.
    if (!settingsStore.internalSettings) {
      settingsStore.internalSettings = data.internalSettings;
    }
    // `boardSettings` should only be updated once.
    if (!settingsStore.boardSettings) {
      if (!data.boardSettings) return;
      //// Update theme styles
      Object.entries(data.boardSettings.styles ?? {}).forEach(([key, value]) => {
        if (value) {
          allThemes[key as ThemeType] = {
            ...allThemes[key as ThemeType],
            ...value,
          };
        }
      });
      //// Update board options, notice that this should always come after 'Update
      //// theme styles', because it uses `themeStore.styles.boardBg`.
      data.boardSettings.boardOptions = {
        autoResize: true,
        useDynamicScale: false,
        internalPlugins: [GUIDELINE_SYSTEM_PLUGIN_NAME].concat(allInternalPlugins),
        excludedPlugins: new Set([FOCUS_PLUGIN_NAME, WATERMARK_PLUGIN_NAME]),
        useGlobalClipboard: false, // TODO : test `true`
        backgroundColor: themeStore.styles.boardBg,
        fitContainerOptions: {
          targetFields: undefined,
        },
        bgMode: false, // TODO : test `true`
        ...data.boardSettings.boardOptions,
      };
      //// Update global settings
      const globalSettings = data.boardSettings.globalSettings ?? {};
      langStore.tgt = globalSettings.defaultLang ?? "en";
      globalSettings.defaultInfoTimeout ??= 300;
      data.boardSettings.globalSettings = globalSettings;
      //// setup property. Once `boardSettings` is set, drawboard will start rendering.
      const setup = () => (settingsStore.boardSettings = data.boardSettings);
      //// inject latest project ////
      const autoSaveProject = await getAutoSaveProject();
      const allProjectInfo = await getAllProjectInfo();
      const updateInitialProject = (project: IProject) => {
        if (data.boardSettings && data.boardSettings.boardOptions) {
          data.boardSettings!.initialProject = project;
          data.boardSettings.boardOptions.fitContainerOptions ??= {};
          data.boardSettings.boardOptions.fitContainerOptions.targetFields =
            project.globalTransform;
        }
      };
      if (!allProjectInfo || allProjectInfo.length === 0) {
        runInAction(() => setup());
      } else if (allProjectInfo.length === 1) {
        runInAction(() => {
          updateInitialProject(autoSaveProject);
          setup();
        });
      } else {
        const latestProject = allProjectInfo.sort((a, b) => b.updateTime - a.updateTime)[0];
        getProject(latestProject.uid).then((project) => {
          runInAction(() => {
            updateInitialProject(project);
            setup();
          });
        });
      }
    }
  });
  return true;
};

//// sync from python
function useSyncPython() {
  const hash = "0";
  const userId = userStore.userId;
  const getMessage = useCallback(
    (): Promise<IPythonSocketRequest> =>
      Promise.resolve({
        hash,
        userId: userStore.userId,
        identifier: "sync",
        nodeData: {},
        nodeDataList: [],
        extraData: {},
        isInternal: true,
      }),
    [],
  );
  const onMessage = useCallback<IPythonOnSocketMessage<ISettingsStore>>(
    async ({ status, total, pending, message, data: { progress, final } }) => {
      collapseAllPlugins();
      if (status !== "finished") {
        if (status === "pending") {
          Logger.warn(`sync pending: ${pending} / ${total}`);
        } else if (status === "working") {
          // Logger.warn(`sync in progress: ${progress}`);
        } else {
          Logger.warn(`sync failed: ${message}`);
          return { newMessage: getMessage };
        }
        return {};
      } else {
        if (!final) {
          Logger.warn("sync data not found");
          return { newMessage: getMessage };
        }
        if (updateSettings(final)) {
          Logger.log(`sync successfully: ${JSON.stringify(final)}, rerendering`);
        }
        return debugStore.pollSync ? { newMessage: getMessage } : {};
      }
    },
    [],
  );

  useWebSocketHook<ISettingsStore>({
    isInvisible: false,
    hash: !!userId ? hash : undefined,
    getMessage,
    onMessage,
    isInternal: true,
  });
}

//// auto save project periodically
function useAutoSaveEvery(second: number) {
  const userId = userStore.userId;
  const timer = useRef<NodeJS.Timeout | null>(null);
  const updateTimer = (timerId: NodeJS.Timeout) => {
    timer.current = timerId;
  };
  const clearTimer = useCallback(() => {
    if (timer.current) {
      Logger.debug(`stop useAutoSaveEvery >>>> clearTimer timer.current: ${timer.current}`);
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const setTimer = useCallback(() => {
    clearTimer();
    if (userId) {
      Logger.debug("restart useAutoSaveEvery");
      autoSavetEvery(second);
    }
  }, [userId]);
  const autoSavetEvery = useCallback(
    (second: number) => {
      const timerId = setTimeout(() => {
        getAutoSaveProjectInfo()
          .then((info) => {
            if (!info) throw new Error("no Auto Save project found");
            const project = useCurrentProjectWithUserId();
            project.uid = info.uid;
            project.name = info.name;
            project.updateTime = getNewUpdateTime();
            Logger.debug("period saving");
            return saveProject(project, async () => void 0, true);
          })
          .then(() => {
            autoSavetEvery(second);
          })
          .catch((err) => {
            console.error("error occurred in autoSavetEvery: ", err);
            autoSavetEvery(second);
          });
      }, second * 1000);
      updateTimer(timerId);
    },
    [userId],
  );

  useEffect(() => {
    setTimer();
    return () => {
      clearTimer();
    };
  }, [userId]);
}

//// check whether all icons of react plugins have loaded
function useCheckIconLoaded() {
  const loaded = useRef<string[]>([]);
  const reactPlugins = useReactPluginSettings();

  useEffect(() => {
    const { dispose } = floatingIconLoadedEvent.on(({ id }) => {
      loaded.current.push(id);
      if (
        reactPlugins.every(
          ({
            type,
            props: {
              renderInfo: { follow },
            },
          }) => follow || loaded.current.some((id) => id.startsWith(type)),
        )
      ) {
        Logger.debug(`all icons loaded: ${loaded.current.join(", ")}}`);
        setupStore.updateProperty("iconLoaded", true);
        dispose();
      }
    });
    return dispose;
  }, [reactPlugins]);
}

//// preload image placeholder
function usePreloadImagePlaceholder() {
  useEffect(() => {
    const placeholder = new Image();
    placeholder.onload = () => {
      setupStore.updateProperty("imagePlaceholderLoaded", true);
      placeholder.src = "";
      placeholder.onload = null;
    };
    placeholder.src = IMAGE_PLACEHOLDER;
  }, []);
}
