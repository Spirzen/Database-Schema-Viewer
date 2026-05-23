import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";

interface Props {
  focusTable: string | null;
  focusFkId: string | null;
  tick: number;
}

/** Pan/zoom to the focused table when navigation is triggered from the details panel. */
export function GraphFocus({ focusTable, focusFkId, tick }: Props) {
  const { fitView, getNodes } = useReactFlow();

  useEffect(() => {
    if (!focusTable && !focusFkId) return;

    const nodes = getNodes();
    const target = focusTable
      ? nodes.filter((n) => n.id === focusTable)
      : nodes;

    if (target.length > 0) {
      fitView({
        nodes: focusTable ? target : nodes,
        padding: 0.55,
        duration: 380,
        maxZoom: 0.95,
        minZoom: 0.15,
      });
    }
  }, [focusTable, focusFkId, tick, fitView, getNodes]);

  return null;
}
