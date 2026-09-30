# 上游来源与改造记录

## 实际母体

- [Jay-Jay-Tee/zombie-orb-arena](https://github.com/Jay-Jay-Tee/zombie-orb-arena)
- 固定提交：`617fe11cc7c0015a328f0d8dbd479dc9a71e422f`
- 原始 `index.html` 留存在 `vendor/zombie-orb-arena.html` 供对照，不进入发布包。
- 首版 `src/audio.js` 从母体 AudioBus 提取，默认静音，增加安全封装；首版仅调用合成音效，不启动原母体音乐循环。
- `src/combat.js` 对应母体 `planWave`、`tryAutoShoot`、`shootAt`、`burst`、`update`、`scheduleMainBossSpecial`、`updateBosses` 的算法改造：圆形碰撞、最近目标搜索、方向向量发射、追击、待执行预警、环形弹幕与扫射激光。
- 所有帧相关速度、寿命和冷却改为秒；移除无限波次和 Boss 增殖，增加竞技场边界、冲击波、两次强化选择。
- `src/input.js` 沿用不同 pointerId 分别拥有摇杆与射击输入的设计，增加 pointer capture、失焦清理及技能输入。
- MIT Copyright (c) 2026 Joshua Jacob Thomas；完整许可在 `public/licenses/zombie-orb-arena.txt`。

## 设计参考（不整仓合并）

- [Echo Shooter](https://github.com/bhanu2006-24/Echo-shooter)，提交 `40e4674f7fc1d2639a5daff1d18d29ec36514573`。参考伤害数字、霓虹命中反馈、粒子、震屏与 WebAudio 战斗反馈；未带入反弹子弹、庇护所和终极技能系统。
- [canvas-vampire-survivors](https://github.com/ricardo-foundry/canvas-vampire-survivors)，提交 `e616704889e57efc9c1f49098786a95c364008d3`。参考 `src/input.js` 的 15% 摇杆死区和响应曲线、`src/data.js` 的独立 Buff 配置、暂停后冻结游戏时间的组织方式。
- 两者许可证正文均为 MIT；界面、图形与本项目 Buff/冲击波实现为本次编写，未使用上游图片或外链字体。

## v0.4 武器参数参考

用户提供 `IMG_2924.jpg`（QBZ191）、`IMG_2925.jpg`（MG42）、`IMG_2926.jpg`（AA12）属性截图，用于录入数值和相对手感。未把原游戏图片、标识图案或声音加入发布包。伤害／射击间隔保持面板值，其余映射及未提供参数的假设见 `WEAPONS.md`。武器选择、大招、弹射和盾冲逻辑为本项目新增实现。

## 枪声与战斗音乐重制

- `src/sound-design.js` 为本项目编写的程序合成声音：三种武器各有四种枪声变体，用带限噪声、低频枪口冲击、机械闭锁和短尾音模拟枪声，不使用真实枪械录音，也不声称还原具体型号。
- `public/audio/battle.wav` 是本项目合成的 132 BPM、16 小节 D 小调战斗配乐，含鼓、低音、和声及短乐句，没有外部采样或歌曲素材。运行 `node scripts/generate-audio.mjs` 可重新生成。
- `src/audio.js` 已重写混音与播放，加入高频衰减、动态压缩、枪声触发时压低配乐、暂停及后台停播。原母体署名与许可证保留用于其余沿用代码。

- 追加独立的冲击波、弹射机器、盾冲、高能光束、电流弹射、魅惑弓及机械换弹合成音，均由 `src/sound-design.js` 生成，无外部采样。

## 2026-09-25 · 机甲美术 v1

`public/art/` 的角色、武器、图标和场景为本项目通过内置 OpenAI image_gen 生成的素材，使用本项目生成的玩家、Boss 和俯视枪械作为风格参考。原图与最终提示词保存在 `output/art-originals/`。发布封面为 `output/covers/neon-breach-art-v1-*`。所有运行时素材本地打包，不引用远程图片。现有代码与音频来源声明继续适用。
