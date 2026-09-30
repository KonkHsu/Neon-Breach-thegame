import { assetUrl } from "./asset-url.js";
import { vectorAsset, vectorIds } from "./evolution-art.js";
// Asset paths support both hosted and standalone offline builds.
const actorIds = [
  "player",
  "chaser",
  "charger",
  "shooter",
  "shield",
  "boss",
  "tree",
  "mage",
  "tomb",
  "sentry",
];
const weaponIds = ["qbz191", "mg42", "aa12", "svd"];
const iconIds = [
  "tar",
  "pulse",
  "ricochet",
  "charge",
  "electric",
  "beam",
  "charm",
  "damage",
  "rate",
  "speed",
  "magazine",
  "reload",
  "pierce",
  "cooldown",
  "heal",
  "dragon",
  "ice",
  "split",
  "chamber",
  "pulse-ammo",
  "coin",
  "victory",
  "defeat",
];
export const ART = Object.fromEntries([
  ...vectorIds.map((id) => [
    id,
    { inline: vectorAsset(id), size: 64, anchor: [0.5, 0.5] },
  ]),
  ...actorIds.map((id) => [
    id,
    {
      file: ["tree", "mage", "tomb", "sentry"].includes(id)
        ? `${id}-v2.png`
        : `${id}.png`,
      anchor: id === "boss" ? [0.4, 0.5] : [0.5, 0.5],
      size:
        id === "tree"
          ? 144
          : id === "mage"
            ? 57
            : id === "tomb"
              ? 61
              : id === "sentry"
                ? 66
                : id === "boss"
                  ? 122
                  : id === "charger"
                    ? 43
                    : 39,
    },
  ]),
  ...["sentry", "frenzy", "thermal", "ember", "salvage"].map((id) => [
    `icon-${id}`,
    { file: `icon-${id}-v2.png` },
  ]),
  ...weaponIds.flatMap((id) => [
    [
      `weapon-${id}`,
      {
        file: `weapon-${id}.png`,
        anchor: [0.38, 0.5],
        size: id === "mg42" || id === "svd" ? 35 : 29,
        muzzle: [0.98, 0.5],
      },
    ],
    [`card-${id}`, { file: `card-${id}.png` }],
  ]),
  ...iconIds.map((id) => [`icon-${id}`, { file: `icon-${id}.png` }]),
  ...["arena", "menu", "station"].map((id) => [id, { file: `${id}.webp` }]),
]);
export const artUrl = (id) =>
  ART[id]?.inline
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ART[id].inline)}`
    : ART[id]
      ? assetUrl(`art/${ART[id].file}`)
      : "";
export function artImage(id, className = "") {
  return ART[id]
    ? `<img class="art-image ${className}" src="${artUrl(id)}" alt="" aria-hidden="true" loading="eager" decoding="async">`
    : "";
}
export class ArtBank {
  constructor() {
    this.images = new Map();
    this.flashes = new Map();
    this.ready = this.load();
  }
  async load() {
    await Promise.all(
      Object.keys(ART).map(
        (id) =>
          new Promise((resolve) => {
            const img = new Image();
            const timer = setTimeout(() => {
              img.onload = img.onerror = null;
              resolve();
            }, 10000);
            img.onload = () => {
              clearTimeout(timer);
              this.images.set(id, img);
              if (actorIds.includes(id)) {
                const mask = document.createElement("canvas");
                mask.width = img.width;
                mask.height = img.height;
                const c = mask.getContext("2d");
                c.drawImage(img, 0, 0);
                c.globalCompositeOperation = "source-in";
                c.fillStyle = "#fff";
                c.fillRect(0, 0, mask.width, mask.height);
                this.flashes.set(id, mask);
              }
              resolve();
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve();
            };
            img.src = artUrl(id);
          }),
      ),
    );
  }
  sprite(c, id, x, y, angle = 0, size = ART[id]?.size, flash = false) {
    const img = (flash && this.flashes.get(id)) || this.images.get(id);
    if (!img) return false;
    const [ax, ay] = ART[id].anchor || [0.5, 0.5];
    const scale = size / Math.max(img.width, img.height);
    const w = img.width * scale,
      h = img.height * scale;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.drawImage(img, -w * ax, -h * ay, w, h);
    c.restore();
    return true;
  }
}
