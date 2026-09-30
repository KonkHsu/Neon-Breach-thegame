export const ANNOUNCEMENT = Object.freeze({
  version: "2026.09.28.1",
  title: "更新",
  intro: "新增自动开火，在设置中开启。",
  lines: [
    "欢迎在 UP 稿件下留言更新建议。",
    "Token 不够用了，下次攒一波一起更新。",
  ],
});
export function announcementState(read, write) {
  let acknowledged = read("announcement-read", "");
  return {
    pending: () => acknowledged !== ANNOUNCEMENT.version,
    acknowledge() {
      acknowledged = ANNOUNCEMENT.version;
      write("announcement-read", acknowledged);
    },
  };
}
