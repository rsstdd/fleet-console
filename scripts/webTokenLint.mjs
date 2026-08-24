const RAW_HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RAW_UNIT = /-?(?:\d+\.?\d*|\.\d+)(?:px|rem)\b/;
const DIMENSION_PROPERTIES = new Set([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
]);

const MESSAGE =
  "Raw colour and visual-unit literals are not permitted here (PRINCIPLES.md 8). " +
  "Use a theme token; add the token to src/styles/tokens.ts when it does not exist.";

function propertyName(node) {
  if (node.type !== "Property" || node.computed) return null;
  if (node.key.type === "Identifier") return node.key.name;
  return typeof node.key.value === "string" ? node.key.value : null;
}

function jsxAttributeName(node) {
  const container = node.parent;
  const attribute = container?.parent;
  if (container?.type !== "JSXExpressionContainer" || attribute?.type !== "JSXAttribute") {
    return null;
  }
  return attribute.name.type === "JSXIdentifier" ? attribute.name.name : null;
}

const noRawVisualUnits = {
  meta: {
    type: "problem",
    schema: [],
    messages: { rawVisualUnit: MESSAGE },
  },
  create(context) {
    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          (RAW_HEX.test(node.value) || RAW_UNIT.test(node.value))
        ) {
          context.report({ node, messageId: "rawVisualUnit" });
          return;
        }
        if (typeof node.value !== "number" || node.value === 0) return;

        const objectProperty = propertyName(node.parent);
        const jsxProperty = jsxAttributeName(node);
        if (
          (objectProperty !== null && DIMENSION_PROPERTIES.has(objectProperty)) ||
          (jsxProperty !== null && DIMENSION_PROPERTIES.has(jsxProperty))
        ) {
          context.report({ node, messageId: "rawVisualUnit" });
        }
      },
    };
  },
};

/** Local ESLint plugin enforcing the web package's token-only visual-unit boundary. */
export default {
  rules: { "no-raw-visual-units": noRawVisualUnits },
};
