import { useEffect } from "react";
import { makeObservable, observable } from "mobx";

import { Graph, Logger, UnitTest, shallowCopy, waitUntil } from "@carefree0910/core";
import { NoliNativeBoard } from "@carefree0910/native";
import {
  BoardStore,
  BoardStoresOptions,
  useFlags,
  useBoardStore,
  useIsReady,
  ABCStore,
} from "@carefree0910/business";

import { BOARD_CONTAINER_ID, IMAGE_PLACEHOLDER, IS_PROD } from "@/utils/constants";
import { settingsStore } from "@/stores/settings";
import { useIsSetup } from "./useSetup";

interface IInitStore {
  working: boolean;
}
class InitStore extends ABCStore<IInitStore> implements IInitStore {
  working: boolean = false;

  constructor() {
    super();
    makeObservable(this, {
      working: observable,
    });
  }

  get info(): IInitStore {
    return this;
  }
}
const initStore = new InitStore();

export function useInitBoard(): void {
  async function _initialize(): Promise<void> {
    if (initStore.working) return;
    initStore.updateProperty("working", true);

    // setup unittest to help initialization
    const unittest = new UnitTest(
      NoliNativeBoard,
      BOARD_CONTAINER_ID,
      settingsStore.boardSettings?.boardOptions,
    );

    // render
    const onEvents = !IS_PROD;
    const initial = settingsStore.boardSettings?.initialProject;
    if (!initial) {
      await unittest.renderEmpty(1, onEvents);
    } else {
      const graph = Graph.fromJsonInfo(shallowCopy(initial.graphInfo));
      graph.allSingleNodes.forEach((node) => {
        if (node.type === "image") {
          node.renderParams.placeholder = IMAGE_PLACEHOLDER;
        }
      });
      await unittest.renderGraph(graph, undefined, onEvents);
    }

    // setup options
    const storeOptions: BoardStoresOptions = {
      constantsOpt: {
        env: IS_PROD ? "production" : "development",
      },
    };
    if (!IS_PROD) {
      storeOptions.debug = {
        selecting: true,
        selectingDetails: false,
      };
    }

    // setup board store
    await useBoardStore(
      unittest.api,
      {
        apiInfo: {},
        groupCode: "",
        modelCodes: [""],
      },
      storeOptions,
    );

    // post settings
    const { setGuidelineSystem } = useFlags();
    setGuidelineSystem(true);
    BoardStore.board.keyboardPluginNullable?.setConfig({
      preventDefaultKeys: {
        AltLeft: true,
        MetaLeft: true,
        BracketLeft: true,
        BracketRight: true,
      },
      ctrlPreventDefaultKeys: {
        KeyA: true,
        KeyZ: true,
      },
    });

    // done
    initStore.updateProperty("working", false);
  }

  useEffect(() => {
    Logger.isDebug = !IS_PROD;
    if (!useIsReady()) {
      waitUntil(useIsSetup).then(() => {
        _initialize();
      });
    }
  }, []);
}
