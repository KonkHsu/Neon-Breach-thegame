import { read, write } from "./storage.js";
import { validateCheckpoint, mergeRecords } from "./endless-save.js";
export const errorText = (error) => error?.message || "本机存储暂不可用，请勿关闭页面";
function save(key, value) {
  if (!write(key, value)) throw Error("浏览器无法持久保存数据，已暂存内存，请勿关闭页面");
}
export class BrowserService {
  async readArchive() { return mergeRecords(read("web-records", null), null); }
  async writeRecord(record) {
    const archive = mergeRecords(await this.readArchive(), record);
    save("web-records", archive);
    return archive;
  }
  async readCheckpoint() {
    const value = read("web-checkpoint", null);
    return !value || value.done ? null : validateCheckpoint(value);
  }
  async writeCheckpoint(value) {
    validateCheckpoint(value);
    if (read("web-checkpoint", null)?.done === value.runId)
      throw Error("该局已结束，不能重新保存旧进度");
    save("web-checkpoint", value);
  }
  async finishCheckpoint(id) { save("web-checkpoint", { done: id }); }
}
