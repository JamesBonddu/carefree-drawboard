import { useEffect } from "react";
import { action, makeObservable, observable, runInAction } from "mobx";

import { Dictionary, getRandomHash, isUndefined, shallowCopy } from "@carefree0910/core";
import { ABCStore } from "@carefree0910/business";

import type { IPythonResults } from "@/schema/meta";
import type { IPythonSocketMessage } from "@/schema/_python";
import { stripHashFromIdentifier } from "@/utils/misc";

interface IDs {
  id: string;
  pureIdentifier: string;
}
export interface IPluginsStore {
  ids: Dictionary<IDs>;
  hashes: Dictionary<string>;
  messages: Dictionary<IPythonSocketMessage<IPythonResults>>;
}
type IPluginCollection = keyof IPluginsStore;
type IPluginCollectionValue<T extends IPluginCollection> = IPluginsStore[T][string];
interface ISetPluginDefault<T extends IPluginCollection> {
  key: string;
  hasEffect: boolean;
  getDefault: () => IPluginCollectionValue<T>;
}
class PluginsStore extends ABCStore<IPluginsStore> implements IPluginsStore {
  ids: Dictionary<IDs> = {};
  hashes: Dictionary<string> = {};
  messages: Dictionary<IPythonSocketMessage<IPythonResults>> = {};

  constructor() {
    super();
    makeObservable(this, {
      ids: observable,
      hashes: observable,
      messages: observable,
      setDefault: action,
    });
  }

  get info(): IPluginsStore {
    return this;
  }

  setDefault<T extends IPluginCollection>(
    collection: T,
    { key, hasEffect, getDefault }: ISetPluginDefault<T>,
  ): IPluginCollectionValue<T> {
    let value = this[collection][key];
    let needUpdate = false;
    if (isUndefined(value)) {
      value = getDefault();
      needUpdate = true;
      if (!hasEffect) {
        this[collection][key] = getDefault();
      }
    }
    // this looks dangerous, but since the `hasEffect` should never
    // change during the lifetime of the app, it's safe to do so
    if (hasEffect) {
      useEffect(() => {
        if (needUpdate) {
          runInAction(() => (this[collection][key] = value));
        }
      });
    }
    return value as IPluginCollectionValue<T>;
  }
}

const pluginsStore = new PluginsStore();
// ids
export const usePluginIds = (identifier: string): IDs => {
  const pureIdentifier = stripHashFromIdentifier(identifier).replaceAll(".", "_");
  return pluginsStore.setDefault("ids", {
    key: pureIdentifier,
    hasEffect: true,
    getDefault: () => ({ id: `${pureIdentifier}_${getRandomHash()}`, pureIdentifier }),
  });
};
// hashes
export const usePluginHash = (id: string): string => {
  return pluginsStore.setDefault("hashes", {
    key: id,
    hasEffect: false,
    getDefault: () => getRandomHash().toString(),
  });
};
// messages
export const usePluginMessage = (id: string): IPluginsStore["messages"][string] | undefined =>
  pluginsStore.messages[id];
export const setPluginMessage = (id: string, message: IPythonSocketMessage<IPythonResults>) => {
  const messages = shallowCopy(pluginsStore.messages);
  messages[id] = message;
  pluginsStore.updateProperty("messages", messages);
};
export const removePluginMessage = (id: string) => {
  const messages = shallowCopy(pluginsStore.messages);
  delete messages[id];
  pluginsStore.updateProperty("messages", messages);
};
export const removePluginMessageFromHash = (hash: string) => {
  const id = Object.keys(pluginsStore.messages).find((id) => pluginsStore.hashes[id] === hash);
  if (!id) return;
  const messages = shallowCopy(pluginsStore.messages);
  delete messages[id];
  pluginsStore.updateProperty("messages", messages);
};
