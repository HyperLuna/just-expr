import type {
  ArrowFunctionExpression,
  Expression,
  MemberExpression,
  Pattern,
  Property,
  Node as AnyNode,
} from 'estree'
import { ENTER, walker } from './walker'
import { ok } from 'devlop'

import { isIdent } from './util'

function extractDeclaration(pattern: Pattern, scope: string[]): void {
  switch (pattern.type) {
    case 'Identifier':
      scope.push(pattern.name)
      break
    case 'ObjectPattern':
      for (const p of pattern.properties) {
        switch (p.type) {
          case 'RestElement':
            extractDeclaration(p.argument, scope)
            break
          case 'Property':
            extractDeclaration(p.value, scope)
            break
          default:
            throw new SyntaxError('unknown ObjectPattern syntax')
        }
      }
      break
    case 'ArrayPattern':
      for (const e of pattern.elements) {
        if (e) {
          extractDeclaration(e, scope)
        }
      }
      break
    case 'RestElement':
      extractDeclaration(pattern.argument, scope)
      break
    case 'AssignmentPattern':
      extractDeclaration(pattern.left, scope)
      break
    default:
      throw new Error('unknown Pattern syntax')
  }
}

export function transform(
  ast: Expression,
  params: string[] = [],
  global?: string | 'this',
  {
    enableThis = false,
    enableUpdate = false,
    enableDelete = false,
    enableInspect = false,
    enableFunctionCall = true,
  } = {},
): Expression {
  for (const [idx, param] of params.entries()) {
    if (!isIdent(param)) {
      throw new SyntaxError(`parameter name '${param}' is not a valid identifier`)
    }
    if (params.indexOf(param, idx + 1) + 1) {
      throw new SyntaxError(`duplicate parameter name '${param}'`)
    }
  }
  if (global != null && global !== 'this' && params.indexOf(global) === -1) {
    throw new SyntaxError(`global object name '${global}' is not in parameter list`)
  }

  const walk = walker(
    {
      [ENTER](node) {
        function stop(cond: boolean, err: string): undefined {
          if (!cond) {
            throw new SyntaxError(err)
          }
        }
        const expr = node as AnyNode
        switch (expr.type) {
          case 'Identifier':
          case 'Literal':
          case 'ArrayExpression':
          case 'ObjectExpression':
          case 'MemberExpression':
          case 'ChainExpression':
          case 'LogicalExpression':
          case 'SequenceExpression':
          case 'ConditionalExpression':
          case 'TemplateLiteral':
          case 'TaggedTemplateExpression':
          case 'ArrowFunctionExpression':
            return
          case 'UnaryExpression':
          case 'BinaryExpression':
            return stop(
              (expr.operator !== 'delete' || (enableUpdate && enableDelete)) &&
                ((expr.operator !== 'typeof' &&
                  expr.operator !== 'in' &&
                  expr.operator !== 'instanceof') ||
                  enableInspect),
              `operator ${expr.operator} is disabled`,
            )
          case 'UpdateExpression':
          case 'AssignmentExpression':
            return stop(enableUpdate, `operator ${expr.operator} is disabled`)
          case 'NewExpression':
          case 'CallExpression':
            return stop(enableFunctionCall, `function call is disabled`)
          case 'ThisExpression':
            return stop(enableThis, `this expression is disabled`)
          case 'FunctionExpression':
          case 'ClassExpression':
          case 'MetaProperty':
          case 'YieldExpression':
          case 'AwaitExpression':
          case 'ImportExpression':
            return stop(false, `expression type ${expr.type} is not allowed`)
          case 'Property':
          case 'ObjectPattern':
          case 'ArrayPattern':
          case 'RestElement':
          case 'AssignmentPattern':
          case 'SpreadElement':
          case 'TemplateElement':
            return
          default:
            throw new SyntaxError(`unknown node type ${expr.type}`)
        }
      },
      ArrowFunctionExpression(node, state): ArrowFunctionExpression {
        if (node.body.type === 'BlockStatement') {
          throw new SyntaxError(`arrow function with block statement is not allowed`)
        } else {
          const scope: string[] = []
          for (const p of node.params) {
            extractDeclaration(p, scope)
          }
          return {
            ...node,
            body: walk(node.body, [...scope, ...state]),
          }
        }
      },
      MemberExpression(node): MemberExpression {
        ok(node.object.type !== 'Super')
        ok(node.property.type !== 'PrivateIdentifier')

        return {
          ...node,
          object: walk(node.object),
          property: node.computed ? walk(node.property) : node.property,
        }
      },
      Property(node): Property {
        ok(node.key.type !== 'PrivateIdentifier')

        return {
          ...node,
          key: node.computed ? walk(node.key) : node.key,
          value: walk(node.value),
        }
      },
      Identifier(node, state) {
        if (state.indexOf(node.name) + 1) return node

        if (global == null) {
          throw new ReferenceError(`variable '${node.name}' is not defined`)
        } else {
          return {
            type: 'MemberExpression',
            computed: false,
            optional: false,
            object:
              global === 'this'
                ? {
                    type: 'ThisExpression',
                  }
                : {
                    type: 'Identifier',
                    name: global,
                  },
            property: {
              type: 'Identifier',
              name: node.name,
            },
          } as MemberExpression
        }
      },
    },
    params,
  )
  return walk(ast)
}

export function compile(
  generate: (ast: Expression) => string,
  ast: Expression,
  params: string[] = [],
  global?: string,
  option = {},
): Function {
  const newTree = transform(ast, params, global, option)
  return new Function(...params, `'use strict';return ${generate(newTree)}`)
}
