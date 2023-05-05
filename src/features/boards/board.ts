import BoardComponent from "features/boards/Board.vue";
import type { GenericComponent, OptionsFunc, Replace, StyleValue } from "features/feature";
import {
    Component,
    findFeatures,
    GatherProps,
    getUniqueID,
    setDefault,
    Visibility
} from "features/feature";
import { globalBus } from "game/events";
import { DefaultValue, deletePersistent, Persistent, State } from "game/persistence";
import { persistent } from "game/persistence";
import type { Unsubscribe } from "nanoevents";
import { Direction, isFunction } from "util/common";
import type {
    Computable,
    GetComputableType,
    GetComputableTypeWithDefault,
    ProcessedComputable
} from "util/computed";
import { processComputable } from "util/computed";
import { createLazyProxy } from "util/proxies";
import { computed, isRef, ref, Ref, unref } from "vue";
import panZoom from "vue-panzoom";
import type { Link } from "../links/links";

globalBus.on("setupVue", app => panZoom.install(app));

/** A symbol used to identify {@link Board} features. */
export const BoardType = Symbol("Board");

/**
 * A type representing a computable value for a node on the board. Used for node types to return different values based on the given node and the state of the board.
 */
export type NodeComputable<T, S extends unknown[] = []> =
    | Computable<T>
    | ((node: BoardNode, ...args: S) => T);

/** Ways to display progress of an action with a duration. */
export enum ProgressDisplay {
    Outline = "Outline",
    Fill = "Fill"
}

/** Node shapes. */
export enum Shape {
    Circle = "Circle",
    Diamond = "Triangle"
}

/** An object representing a node on the board. */
export interface BoardNode {
    id: number;
    position: {
        x: number;
        y: number;
    };
    type: string;
    state?: State;
    pinned?: boolean;
}

/** An object representing a link between two nodes on the board. */
export interface BoardNodeLink extends Omit<Link, "startNode" | "endNode"> {
    startNode: BoardNode;
    endNode: BoardNode;
    stroke: string;
    strokeWidth: number;
    pulsing?: boolean;
}

/** An object representing a label for a node. */
export interface NodeLabel {
    text: string;
    color?: string;
    pulsing?: boolean;
}

/** The persistent data for a board. */
export type BoardData = {
    nodes: BoardNode[];
    selectedNode: number | null;
    selectedAction: string | null;
};

/**
 * An object that configures a {@link NodeType}.
 */
export interface NodeTypeOptions {
    /** The title to display for the node. */
    title: NodeComputable<string>;
    /** An optional label for the node. */
    label?: NodeComputable<NodeLabel | null>;
    /** The size of the node - diameter for circles, width and height for squares. */
    size: NodeComputable<number>;
    /** CSS to apply to this node. */
    style?: NodeComputable<StyleValue>;
    /** Dictionary of CSS classes to apply to this node. */
    classes?: NodeComputable<Record<string, boolean>>;
    /** Whether the node is draggable or not. */
    draggable?: NodeComputable<boolean>;
    /** The shape of the node. */
    shape: NodeComputable<Shape>;
    /** Whether the node can accept another node being dropped upon it. */
    canAccept?: NodeComputable<boolean, [BoardNode]>;
    /** The progress value of the node. */
    progress?: NodeComputable<number>;
    /** How the progress should be displayed on the node. */
    progressDisplay?: NodeComputable<ProgressDisplay>;
    /** The color of the progress indicator. */
    progressColor?: NodeComputable<string>;
    /** The fill color of the node. */
    fillColor?: NodeComputable<string>;
    /** The outline color of the node. */
    outlineColor?: NodeComputable<string>;
    /** The color of the title text. */
    titleColor?: NodeComputable<string>;
    /** The list of action options for the node. */
    actions?: BoardNodeActionOptions[];
    /** The arc between each action, in radians. */
    actionDistance?: NodeComputable<number>;
    /** A function that is called when the node is clicked. */
    onClick?: (node: BoardNode) => void;
    /** A function that is called when a node is dropped onto this node. */
    onDrop?: (node: BoardNode, otherNode: BoardNode) => void;
    /** A function that is called for each node of this type every tick. */
    update?: (node: BoardNode, diff: number) => void;
}

/**
 * The properties that are added onto a processed {@link NodeTypeOptions} to create a {@link NodeType}.
 */
export interface BaseNodeType {
    /** The nodes currently on the board of this type. */
    nodes: Ref<BoardNode[]>;
}

/** An object that represents a type of node that can appear on a board. It will handle getting properties and callbacks for every node of that type. */
export type NodeType<T extends NodeTypeOptions> = Replace<
    T & BaseNodeType,
    {
        title: GetComputableType<T["title"]>;
        label: GetComputableType<T["label"]>;
        size: GetComputableTypeWithDefault<T["size"], 50>;
        style: GetComputableType<T["style"]>;
        classes: GetComputableType<T["classes"]>;
        draggable: GetComputableTypeWithDefault<T["draggable"], false>;
        shape: GetComputableTypeWithDefault<T["shape"], Shape.Circle>;
        canAccept: GetComputableTypeWithDefault<T["canAccept"], false>;
        progress: GetComputableType<T["progress"]>;
        progressDisplay: GetComputableTypeWithDefault<T["progressDisplay"], ProgressDisplay.Fill>;
        progressColor: GetComputableTypeWithDefault<T["progressColor"], "none">;
        fillColor: GetComputableType<T["fillColor"]>;
        outlineColor: GetComputableType<T["outlineColor"]>;
        titleColor: GetComputableType<T["titleColor"]>;
        actions?: GenericBoardNodeAction[];
        actionDistance: GetComputableTypeWithDefault<T["actionDistance"], number>;
    }
>;

/** A type that matches any valid {@link NodeType} object. */
export type GenericNodeType = Replace<
    NodeType<NodeTypeOptions>,
    {
        size: NodeComputable<number>;
        draggable: NodeComputable<boolean>;
        shape: NodeComputable<Shape>;
        canAccept: NodeComputable<boolean, [BoardNode]>;
        progressDisplay: NodeComputable<ProgressDisplay>;
        progressColor: NodeComputable<string>;
        actionDistance: NodeComputable<number>;
    }
>;

/**
 * An object that configures a {@link BoardNodeAction}.
 */
export interface BoardNodeActionOptions {
    /** A unique identifier for the action. */
    id: string;
    /** Whether this action should be visible. */
    visibility?: NodeComputable<Visibility | boolean>;
    /** The icon to display for the action. */
    icon: NodeComputable<string>;
    /** The fill color of the action. */
    fillColor?: NodeComputable<string>;
    /** The tooltip text to display for the action. */
    tooltip: NodeComputable<NodeLabel>;
    /** The confirmation label that appears under the action. */
    confirmationLabel?: NodeComputable<NodeLabel>;
    /** An array of board node links associated with the action. They appear when the action is focused. */
    links?: NodeComputable<BoardNodeLink[]>;
    /** A function that is called when the action is clicked. */
    onClick: (node: BoardNode) => void;
}

/**
 * The properties that are added onto a processed {@link BoardNodeActionOptions} to create an {@link BoardNodeAction}.
 */
export interface BaseBoardNodeAction {
    links?: Ref<BoardNodeLink[]>;
}

/** An object that represents an action that can be taken upon a node. */
export type BoardNodeAction<T extends BoardNodeActionOptions> = Replace<
    T & BaseBoardNodeAction,
    {
        visibility: GetComputableTypeWithDefault<T["visibility"], Visibility.Visible>;
        icon: GetComputableType<T["icon"]>;
        fillColor: GetComputableType<T["fillColor"]>;
        tooltip: GetComputableType<T["tooltip"]>;
        confirmationLabel: GetComputableTypeWithDefault<T["confirmationLabel"], NodeLabel>;
        links: GetComputableType<T["links"]>;
    }
>;

/** A type that matches any valid {@link BoardNodeAction} object. */
export type GenericBoardNodeAction = Replace<
    BoardNodeAction<BoardNodeActionOptions>,
    {
        visibility: NodeComputable<Visibility | boolean>;
        confirmationLabel: NodeComputable<NodeLabel>;
    }
>;

/**
 * An object that configures a {@link Board}.
 */
export interface BoardOptions {
    /** Whether this board should be visible. */
    visibility?: Computable<Visibility | boolean>;
    /** The height of the board. Defaults to 100% */
    height?: Computable<string>;
    /** The width of the board. Defaults to 100% */
    width?: Computable<string>;
    /** Dictionary of CSS classes to apply to this feature. */
    classes?: Computable<Record<string, boolean>>;
    /** CSS to apply to this feature. */
    style?: Computable<StyleValue>;
    /** A function that returns an array of initial board nodes, without IDs. */
    startNodes: () => Omit<BoardNode, "id">[];
    /** A dictionary of node types that can appear on the board. */
    types: Record<string, NodeTypeOptions>;
    /** The persistent state of the board. */
    state?: Computable<BoardData>;
    /** An array of board node links to display. */
    links?: Computable<BoardNodeLink[] | null>;
}

/**
 * The properties that are added onto a processed {@link BoardOptions} to create a {@link Board}.
 */
export interface BaseBoard {
    /** An auto-generated ID for identifying features that appear in the DOM. Will not persist between refreshes or updates. */
    id: string;
    /** All the nodes currently on the board. */
    nodes: Ref<BoardNode[]>;
    /** The currently selected node, if any. */
    selectedNode: Ref<BoardNode | null>;
    /** The currently selected action, if any. */
    selectedAction: Ref<GenericBoardNodeAction | null>;
    /** The currently being dragged node, if any. */
    draggingNode: Ref<BoardNode | null>;
    /** If dragging a node, the node it's currently being hovered over, if any. */
    receivingNode: Ref<BoardNode | null>;
    /** The current mouse position, if over the board. */
    mousePosition: Ref<{ x: number; y: number } | null>;
    /** Places a node in the nearest empty space in the given direction with the specified space around it. */
    placeInAvailableSpace: (node: BoardNode, radius?: number, direction?: Direction) => void;
    /** A symbol that helps identify features of the same type. */
    type: typeof BoardType;
    /** The Vue component used to render this feature. */
    [Component]: GenericComponent;
    /** A function to gather the props the vue component requires for this feature. */
    [GatherProps]: () => Record<string, unknown>;
}

/** An object that represents a feature that is a zoomable, pannable board with various nodes upon it. */
export type Board<T extends BoardOptions> = Replace<
    T & BaseBoard,
    {
        visibility: GetComputableTypeWithDefault<T["visibility"], Visibility.Visible>;
        types: Record<string, GenericNodeType>;
        height: GetComputableType<T["height"]>;
        width: GetComputableType<T["width"]>;
        classes: GetComputableType<T["classes"]>;
        style: GetComputableType<T["style"]>;
        state: GetComputableTypeWithDefault<T["state"], Persistent<BoardData>>;
        links: GetComputableTypeWithDefault<T["links"], Ref<BoardNodeLink[] | null>>;
    }
>;

/** A type that matches any valid {@link Board} object. */
export type GenericBoard = Replace<
    Board<BoardOptions>,
    {
        visibility: ProcessedComputable<Visibility | boolean>;
        state: ProcessedComputable<BoardData>;
        links: ProcessedComputable<BoardNodeLink[] | null>;
    }
>;

/**
 * Lazily creates a board with the given options.
 * @param optionsFunc Board options.
 */
export function createBoard<T extends BoardOptions>(
    optionsFunc: OptionsFunc<T, BaseBoard, GenericBoard>
): Board<T> {
    const state = persistent<BoardData>(
        {
            nodes: [],
            selectedNode: null,
            selectedAction: null
        },
        false
    );

    return createLazyProxy(feature => {
        const board = optionsFunc.call(feature, feature);
        board.id = getUniqueID("board-");
        board.type = BoardType;
        board[Component] = BoardComponent as GenericComponent;

        if (board.state) {
            deletePersistent(state);
            processComputable(board as T, "state");
        } else {
            state[DefaultValue] = {
                nodes: board.startNodes().map((n, i) => {
                    (n as BoardNode).id = i;
                    return n as BoardNode;
                }),
                selectedNode: null,
                selectedAction: null
            };
            board.state = state;
        }

        board.nodes = computed(() => unref(processedBoard.state).nodes);
        board.selectedNode = computed({
            get() {
                return (
                    processedBoard.nodes.value.find(
                        node => node.id === unref(processedBoard.state).selectedNode
                    ) || null
                );
            },
            set(node) {
                if (isRef(processedBoard.state)) {
                    processedBoard.state.value = {
                        ...processedBoard.state.value,
                        selectedNode: node?.id ?? null
                    };
                } else {
                    processedBoard.state.selectedNode = node?.id ?? null;
                }
            }
        });
        board.selectedAction = computed({
            get() {
                const selectedNode = processedBoard.selectedNode.value;
                if (selectedNode == null) {
                    return null;
                }
                const type = processedBoard.types[selectedNode.type];
                if (type.actions == null) {
                    return null;
                }
                return (
                    type.actions.find(
                        action => action.id === unref(processedBoard.state).selectedAction
                    ) || null
                );
            },
            set(action) {
                if (isRef(processedBoard.state)) {
                    processedBoard.state.value = {
                        ...processedBoard.state.value,
                        selectedAction: action?.id ?? null
                    };
                } else {
                    processedBoard.state.selectedAction = action?.id ?? null;
                }
            }
        });
        board.mousePosition = ref(null);
        if (board.links) {
            processComputable(board as T, "links");
        } else {
            board.links = computed(() => {
                if (processedBoard.selectedAction.value == null) {
                    return null;
                }
                if (
                    processedBoard.selectedAction.value.links &&
                    processedBoard.selectedNode.value
                ) {
                    return getNodeProperty(
                        processedBoard.selectedAction.value.links,
                        processedBoard.selectedNode.value
                    );
                }
                return null;
            });
        }
        board.draggingNode = ref(null);
        board.receivingNode = ref(null);
        processComputable(board as T, "visibility");
        setDefault(board, "visibility", Visibility.Visible);
        processComputable(board as T, "width");
        setDefault(board, "width", "100%");
        processComputable(board as T, "height");
        setDefault(board, "height", "100%");
        processComputable(board as T, "classes");
        processComputable(board as T, "style");

        for (const type in board.types) {
            const nodeType: NodeTypeOptions & Partial<BaseNodeType> = board.types[type];

            processComputable(nodeType as NodeTypeOptions, "title");
            processComputable(nodeType as NodeTypeOptions, "label");
            processComputable(nodeType as NodeTypeOptions, "size");
            setDefault(nodeType, "size", 50);
            processComputable(nodeType as NodeTypeOptions, "style");
            processComputable(nodeType as NodeTypeOptions, "classes");
            processComputable(nodeType as NodeTypeOptions, "draggable");
            setDefault(nodeType, "draggable", false);
            processComputable(nodeType as NodeTypeOptions, "shape");
            setDefault(nodeType, "shape", Shape.Circle);
            processComputable(nodeType as NodeTypeOptions, "canAccept");
            setDefault(nodeType, "canAccept", false);
            processComputable(nodeType as NodeTypeOptions, "progress");
            processComputable(nodeType as NodeTypeOptions, "progressDisplay");
            setDefault(nodeType, "progressDisplay", ProgressDisplay.Fill);
            processComputable(nodeType as NodeTypeOptions, "progressColor");
            setDefault(nodeType, "progressColor", "none");
            processComputable(nodeType as NodeTypeOptions, "fillColor");
            processComputable(nodeType as NodeTypeOptions, "outlineColor");
            processComputable(nodeType as NodeTypeOptions, "titleColor");
            processComputable(nodeType as NodeTypeOptions, "actionDistance");
            setDefault(nodeType, "actionDistance", Math.PI / 6);
            nodeType.nodes = computed(() =>
                unref(processedBoard.state).nodes.filter(node => node.type === type)
            );
            setDefault(nodeType, "onClick", function (node: BoardNode) {
                unref(processedBoard.state).selectedNode = node.id;
            });

            if (nodeType.actions) {
                for (const action of nodeType.actions) {
                    processComputable(action, "visibility");
                    setDefault(action, "visibility", Visibility.Visible);
                    processComputable(action, "icon");
                    processComputable(action, "fillColor");
                    processComputable(action, "tooltip");
                    processComputable(action, "confirmationLabel");
                    setDefault(action, "confirmationLabel", { text: "Tap again to confirm" });
                    processComputable(action, "links");
                }
            }
        }

        function setDraggingNode(node: BoardNode | null) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            board.draggingNode!.value = node;
        }
        function setReceivingNode(node: BoardNode | null) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            board.receivingNode!.value = node;
        }

        board.placeInAvailableSpace = function (
            node: BoardNode,
            radius = 100,
            direction = Direction.Right
        ) {
            const nodes = processedBoard.nodes.value
                .slice()
                .filter(n => {
                    // Exclude self
                    if (n === node) {
                        return false;
                    }

                    // Exclude nodes that aren't within the corridor we'll be moving within
                    if (
                        (direction === Direction.Down || direction === Direction.Up) &&
                        Math.abs(n.position.x - node.position.x) > radius
                    ) {
                        return false;
                    }
                    if (
                        (direction === Direction.Left || direction === Direction.Right) &&
                        Math.abs(n.position.y - node.position.y) > radius
                    ) {
                        return false;
                    }

                    // Exclude nodes in the wrong direction
                    return !(
                        (direction === Direction.Right &&
                            n.position.x < node.position.x - radius) ||
                        (direction === Direction.Left && n.position.x > node.position.x + radius) ||
                        (direction === Direction.Up && n.position.y > node.position.y + radius) ||
                        (direction === Direction.Down && n.position.y < node.position.y - radius)
                    );
                })
                .sort(
                    direction === Direction.Right
                        ? (a, b) => a.position.x - b.position.x
                        : direction === Direction.Left
                        ? (a, b) => b.position.x - a.position.x
                        : direction === Direction.Up
                        ? (a, b) => b.position.y - a.position.y
                        : (a, b) => a.position.y - b.position.y
                );
            for (let i = 0; i < nodes.length; i++) {
                const nodeToCheck = nodes[i];
                const distance =
                    direction === Direction.Right || direction === Direction.Left
                        ? Math.abs(node.position.x - nodeToCheck.position.x)
                        : Math.abs(node.position.y - nodeToCheck.position.y);

                // If we're too close to this node, move further
                if (distance < radius) {
                    if (direction === Direction.Right) {
                        node.position.x = nodeToCheck.position.x + radius;
                    } else if (direction === Direction.Left) {
                        node.position.x = nodeToCheck.position.x - radius;
                    } else if (direction === Direction.Up) {
                        node.position.y = nodeToCheck.position.y - radius;
                    } else if (direction === Direction.Down) {
                        node.position.y = nodeToCheck.position.y + radius;
                    }
                } else if (i > 0 && distance > radius) {
                    // If we're further from this node than the radius, then the nodes are past us and we can early exit
                    break;
                }
            }
        };

        board[GatherProps] = function (this: GenericBoard) {
            const {
                nodes,
                types,
                state,
                visibility,
                width,
                height,
                style,
                classes,
                links,
                selectedAction,
                selectedNode,
                mousePosition,
                draggingNode,
                receivingNode
            } = this;
            return {
                nodes,
                types,
                state,
                visibility,
                width,
                height,
                style: unref(style),
                classes,
                links,
                selectedAction,
                selectedNode,
                mousePosition,
                draggingNode,
                receivingNode,
                setDraggingNode,
                setReceivingNode
            };
        };

        // This is necessary because board.types is different from T and Board
        const processedBoard = board as unknown as Board<T>;
        return processedBoard;
    });
}

/**
 * Gets the value of a property for a specified node.
 * @param property The property to find the value of
 * @param node The node to get the property of
 */
export function getNodeProperty<T, S extends unknown[]>(
    property: NodeComputable<T, S>,
    node: BoardNode,
    ...args: S
): T {
    return isFunction<T, [BoardNode, ...S], Computable<T>>(property)
        ? property(node, ...args)
        : unref(property);
}

/**
 * Utility to get an ID for a node that is guaranteed unique.
 * @param board The board feature to generate an ID for
 */
export function getUniqueNodeID(board: GenericBoard): number {
    let id = 0;
    board.nodes.value.forEach(node => {
        if (node.id >= id) {
            id = node.id + 1;
        }
    });
    return id;
}

const listeners: Record<string, Unsubscribe | undefined> = {};
globalBus.on("addLayer", layer => {
    const boards: GenericBoard[] = findFeatures(layer, BoardType) as GenericBoard[];
    listeners[layer.id] = layer.on("postUpdate", diff => {
        boards.forEach(board => {
            Object.values(board.types).forEach(type =>
                type.nodes.value.forEach(node => type.update?.(node, diff))
            );
        });
    });
});
globalBus.on("removeLayer", layer => {
    // unsubscribe from postUpdate
    listeners[layer.id]?.();
    listeners[layer.id] = undefined;
});
