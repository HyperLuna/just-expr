# just-expr

> Traverse and transform javascript AST to make sure it's **JUST** expression.

## API

### .transform

Core API, traverses and transforms JavaScript AST in ESTree format to ensure it's **JUST** a JavaScript expression, and captures all free variables.

The AST can come from [@babel/parser](https://babel.dev/docs/babel-parser), [acorn](https://github.com/acornjs/acorn), or any ESTree-compatible JavaScript parser.

#### Params

- **ast**: `Expression` The JavaScript expression AST in ESTree format.

- **params**: `string[] = []` List of variable names that the expression is allowed to access. If there is variable not in this list and the `global` parameter is not set, an exception will be thrown.

- **global**: `?string | 'this'` The variable used to capture variables not in the `params` list. This variable name must be in `params`, or to be `'this'`.

- **options**: `Options` Transformation options.

  - **enableThis**: `?boolean` enable access to `this` (default: **false**)

  - **enableUpdate**: `?boolean` enable increment/decrement operators and assignment expressions (default: **false**)

  - **enableDelete**: `?boolean` enable operator `delete` (default: **false**)

  - **enableInspect**: `?boolean` enable operator `in`, `instanceof`, `typeof` (default: **false**)

  - **enableFunctionCall**: `?boolean` enable function calls and operator `new` (default: **true**)

#### Return

Returns the processed AST. The new AST will reuse the original AST but will not modify it.

#### Usage

```typescript
import { parseExpressionAt } from 'acorn'
import { generate } from 'astring'
import type { Expression } from 'estree'

import { traverse } from 'just-expr'

function parse(expr: string): Expression {
  return parseExpressionAt(expr, 0, { ecmaVersion: 'latest' }) as Expression
}
function print(tree: Expression): void {
  console.log(generate(tree))
}

// Expression without variable access
print(traverse(parse('1 + 2'))) // => 1 + 2

// Expression with variable access, allowed variable names need to be in params
print(traverse(parse('1 + a'), ['a'])) // => 1 + a

// Throws an exception when accessing variables not in params
print(traverse(parse('a + b.a'), ['a'])) // ReferenceError: b is not defined

// When the global parameter is set, the global variable captures all variables not in params
print(traverse(parse('a.c + a[b] + c'), ['a'], 'a')) // => a.c + a[a.b] + a.c

// Can use 'this' to capture variables not in params
print(traverse(parse('arguments + eval'), [], 'this')) // => this.arguments + this.eval

// Correctly handles function scopes
print(traverse(parse('a => b => Math.max(a, c) + b'), ['Math'], 'this')) // => a => b => Math.max(a, this.c) + b
```

### .compile

Traverses and transforms the AST, then compiles it into a function object.

#### Params

- **generate**: `(ast: Expression) => string` Code generation function, takes an expression AST as parameter and returns the generated code.

The remaining parameters will pass to `.transform` function:

- **ast**: `Expression`

- **params**: `string[] = []`

- **global**: `?string | 'this'`

- **options**: `Options`

#### Return

Returns a function object equivalent to the expression, with parameters matching `params`.

#### Usage

```typescript
import { parseExpressionAt } from 'acorn'
import { generate } from 'astring'
import type { Expression } from 'estree'

import { compile } from 'just-expr'

function parse(expr: string): Expression {
  return parseExpressionAt(expr, 0, { ecmaVersion: 'latest' }) as Expression
}

// Compile the AST to a function
const calc = compile(generate, parse('a + b'), ['a', 'b'])
console.log(calc(3, 4)) // => 7

// Can't compile expression using global variables or functions
compile(generate, parse('Math.max(1, 2)')) // ReferenceError: variable 'Math' is not defined
// But can be provided via params
console.log(compile(generate, parse('Math.max(1, 2)'), ['Math'])(Math)) // => 2
// Or via global
console.log(compile(generate, parse('Math.max(a, 2)'), ['_', 'a'], '_')({Math}, 5)) // => 5
// Or even directly pass the global object
console.log(compile(generate, parse('eval("alert(123)")'), ['_'], '_')(window)) // => undefined
```

## Limitation

just-expr only supports the following expressions:

- Identifier
- Literal
- ArrayExpression
- ObjectExpression
- MemberExpression
- ChainExpression
- LogicalExpression
- SequenceExpression
- ConditionalExpression
- TemplateLiteral
- TaggedTemplateExpression
- ArrowFunctionExpression (function body must be an expression)

The following expressions are affected by options:

- UnaryExpression
- BinaryExpression
- UpdateExpression
- AssignmentExpression
- NewExpression
- CallExpression
- ThisExpression

The following expressions are not supported:

- *AwaitExpression*
- FunctionExpression
- ClassExpression
- MetaProperty
- YieldExpression
- ImportExpression

## License

Copyright © 2025, [HyperLuna](https://github.com/HyperLuna).

Released under the [MIT License](LICENSE).
