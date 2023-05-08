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

const id = "p";
const layer = createLayer(id, function (this: BaseLayer) {
    const points = createResource<DecimalSource>(0, "prestige points");

    this.on("update", diff => {
        points.value = Decimal.add(points.value, Decimal.times(myModifier.apply(1), diff));
    });

    const myUpgrade = createUpgrade(() => ({
    	requirements: createCostRequirement(() => ({
    		resource: noPersist(points),
    		cost: 10
    	})),
    	display: {
    		description: "Double points generation"
    	}
    }));

    const myModifier = createSequentialModifier(() => [
    	createMultiplicativeModifier(() => ({
    		multiplier: 2,
    		enabled: myUpgrade.bought
    	}))
    ]);

    return {
    	points,
    	myUpgrade,
        display: jsx(() => (
            <>
                <MainDisplay resource={points} />
                {render(myUpgrade)}
            </>
        ))
    }
});