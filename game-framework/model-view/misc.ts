import { isDestroyed } from "../core/misc";
import { Sprite, SpriteFrame } from "cc";
import { AssetHandle } from "../services/asset-service";


/**
 * 
 * 设置SpriteFrame
 * 
 * @param spr 
 * @param handle 
 */
export const setSpriteFrame = function (spr: Sprite, handle: AssetHandle<typeof SpriteFrame>) {
    if (!handle.getAsset()) {
        if (handle.load) {
            handle.load.then(e => {
                if (isDestroyed(spr.node)) {
                    return;
                }

                handle.setFrame(spr, true);
            });
        } else {
            handle.asyncLoad().then(e => {
                if (isDestroyed(spr.node)) {
                    return;
                }

                handle.setFrame(spr, true);
            });
        }
    } else {
        handle.setFrame(spr, true);
    }
}