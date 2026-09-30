const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", Object.freeze({
  get: () => ipcRenderer.invoke("desktop:get"),
  save: (providers) => ipcRenderer.invoke("desktop:save", providers),
  start: () => ipcRenderer.invoke("desktop:start"),
  onStatus: (listener) => ipcRenderer.on("desktop:status", (_event, value) => listener(value))
}));
