/**
 * @module
 * @hidden
 */
import farmer from "./farmer";
import { createCumulativeConversion } from "features/conversion";
import { jsx } from "features/feature";
import { createHotkey } from "features/hotkey";
import { createReset } from "features/reset";
import MainDisplay from "features/resources/MainDisplay.vue";
import { createResource } from "features/resources/resource";
import { addTooltip } from "features/tooltips/tooltip";
import { createResourceTooltip } from "features/trees/tree";
import { BaseLayer, createLayer } from "game/layers";
import type { DecimalSource } from "util/bignum";
import { render } from "util/vue";
import { createLayerTreeNode, createResetButton } from "../common";

const id = "squire";
const layer = createLayer(id, function (this: BaseLayer) {
    const name = "The Squire";
    const color = "#32527B";
    const honor = createResource<DecimalSource>(0, "honor");

    const conversion = createCumulativeConversion(() => ({
        formula: x => x.div(10).sqrt(),
        baseResource: farmer.points,
        gainResource: honor
    }));

    const reset = createReset(() => ({
        thingsToReset: (): Record<string, unknown>[] => [layer]
    }));

    const treeNode = createLayerTreeNode(() => ({
        layerID: "s",
        color,
        reset
    }));

    addTooltip(treeNode, {
        display: createResourceTooltip(honor),
        pinnable: true
    });

    // const resetButton = createResetButton(() => ({
    //     conversion,
    //     tree: farmer.tree,
    //     treeNode
    // }));

    return {
        name,
        color,
        honor,
        display: jsx(() => (
            <>
                <MainDisplay resource={honor} color={color} />
                {/* {render(resetButton)} */}
            </>
        )),
        treeNode
    };
});

export default layer;
