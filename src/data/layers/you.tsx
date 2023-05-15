/**
 * @module
 * @hidden
 */
import Spacer from "components/layout/Spacer.vue";
import { jsx } from "features/feature";
import { createResource, trackBest, trackOOMPS, trackTotal } from "features/resources/resource";
import type { GenericTree } from "features/trees/tree";
import { branchedResetPropagation, createTree } from "features/trees/tree";
import { globalBus } from "game/events";
import type { BaseLayer, GenericLayer } from "game/layers";
import { createLayer } from "game/layers";
import type { Player } from "game/player";
import player from "game/player";
import type { DecimalSource } from "util/bignum";
import Decimal, { format, formatTime } from "util/bignum";
import { render } from "util/vue";
import { computed, toRaw } from "vue";
import squire from "./squire";
import farmer from "./farmer";

const id = "you";
const layer = createLayer(id, function (this: BaseLayer) {
    const gold = createResource<DecimalSource>(0, "g", 0, false);
    const age = createResource<DecimalSource>(14, "yr", 1, false);

    const pointGain = computed(() => {
        // eslint-disable-next-line prefer-const
        let gain = new Decimal(1);
        return gain;
    });
    globalBus.on("update", diff => {
        // if we are doing a task, do it. if it completes, do the completion of it.
    });

    const tree = createTree(() => ({
        nodes: [[farmer.treeNode, squire.treeNode]],
        branches: [],
        onReset() {
            age.value = 18;
        },
        resetPropagation: branchedResetPropagation
    })) as GenericTree;

    return {
        name: "Tree",
        links: tree.links,
        display: jsx(() => (
            <>
                {player.devSpeed === 0 ? <div>Game Paused</div> : null}
                {player.devSpeed != null && player.devSpeed !== 0 && player.devSpeed !== 1 ? (
                    <div>Dev Speed: {format(player.devSpeed)}x</div>
                ) : null}
                {player.offlineTime != null && player.offlineTime !== 0 ? (
                    <div>Offline Time: {formatTime(player.offlineTime)}</div>
                ) : null}
                <div>
                    {Decimal.lt(gold.value, "1e1000") ? <span>You have </span> : null}
                    <h2>{format(gold.value)}</h2>
                    {Decimal.lt(gold.value, "1e1e6") ? <span> gold</span> : null}
                </div>
                <Spacer />
                {render(tree)}
            </>
        )),
        age,
        gold,
        tree
    };
});

export default layer;
