const RAW_HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;
const RAW_UNIT = /-?(?:\d+\.?\d*|\.\d+)(?:px|rem)\b/i;
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

function directJsxAttributeName(node) {
  return node.name.type === "JSXIdentifier" ? node.name.name : null;
}

function isIntrinsicJsxAttribute(node) {
  const elementName = node.parent?.name;
  return (
    elementName?.type === "JSXIdentifier" &&
    elementName.name[0] !== undefined &&
    elementName.name[0] === elementName.name[0].toLowerCase()
  );
}

const noRawVisualUnits = {
  meta: {
    type: "problem",
    schema: [],
    messages: { rawVisualUnit: MESSAGE },
  },
  create(context) {
    function variableInitializer(identifier) {
      let scope = context.sourceCode.getScope(identifier);
      while (scope !== null) {
        const variable = scope.set.get(identifier.name);
        const definition = variable?.defs.find((candidate) => candidate.type === "Variable");
        if (definition?.node.type === "VariableDeclarator") {
          return definition.node.init;
        }
        scope = scope.upper;
      }
      return null;
    }

    function reportNumericDimension(value, seenIdentifiers = new Set()) {
      if (value === null) return;
      if (value.type === "Literal") {
        if (typeof value.value === "number" && value.value !== 0) {
          context.report({ node: value, messageId: "rawVisualUnit" });
        }
        return;
      }
      if (value.type === "UnaryExpression") {
        if (
          (value.operator === "+" || value.operator === "-") &&
          value.argument.type === "Literal" &&
          typeof value.argument.value === "number" &&
          value.argument.value !== 0
        ) {
          context.report({ node: value, messageId: "rawVisualUnit" });
        }
        return;
      }
      if (value.type === "Identifier") {
        if (seenIdentifiers.has(value.name)) return;
        const initializer = variableInitializer(value);
        if (initializer !== null) {
          reportNumericDimension(initializer, new Set([...seenIdentifiers, value.name]));
        }
        return;
      }
      if (value.type === "ObjectExpression") {
        for (const property of value.properties) {
          if (property.type === "Property") reportNumericDimension(property.value, seenIdentifiers);
        }
        return;
      }
      if (value.type === "ArrayExpression") {
        for (const element of value.elements) reportNumericDimension(element, seenIdentifiers);
        return;
      }
      if (value.type === "ConditionalExpression") {
        reportNumericDimension(value.consequent, seenIdentifiers);
        reportNumericDimension(value.alternate, seenIdentifiers);
        return;
      }
      if (value.type === "LogicalExpression") {
        reportNumericDimension(value.left, seenIdentifiers);
        reportNumericDimension(value.right, seenIdentifiers);
        return;
      }
      if (
        value.type === "TSAsExpression" ||
        value.type === "TSSatisfiesExpression" ||
        value.type === "TSTypeAssertion" ||
        value.type === "ChainExpression"
      ) {
        reportNumericDimension(value.expression, seenIdentifiers);
      }
    }

    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          (RAW_HEX.test(node.value) || RAW_UNIT.test(node.value))
        ) {
          context.report({ node, messageId: "rawVisualUnit" });
        }
      },
      TemplateLiteral(node) {
        const representativeValue = node.quasis
          .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
          .join("0");
        if (RAW_HEX.test(representativeValue) || RAW_UNIT.test(representativeValue)) {
          context.report({ node, messageId: "rawVisualUnit" });
        }
      },
      Property(node) {
        const name = propertyName(node);
        if (name !== null && DIMENSION_PROPERTIES.has(name)) {
          reportNumericDimension(node.value);
        }
      },
      JSXAttribute(node) {
        const name = directJsxAttributeName(node);
        if (
          name !== null &&
          DIMENSION_PROPERTIES.has(name) &&
          !isIntrinsicJsxAttribute(node) &&
          node.value?.type === "JSXExpressionContainer"
        ) {
          reportNumericDimension(node.value.expression);
        }
      },
    };
  },
};

/** Local ESLint plugin enforcing the web package's token-only visual-unit boundary. */
export default {
  rules: { "no-raw-visual-units": noRawVisualUnits },
};
