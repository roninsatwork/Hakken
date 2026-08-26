import { v } from "convex/values";

import { rowShape } from "./rowShape";

/** What the widget configuration screens hand back. */

export const widgetListShape = v.array(rowShape.widgets);

export const widgetOrNullShape = v.union(rowShape.widgets, v.null());
