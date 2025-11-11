import type { Expression, Pattern, Node } from 'estree'
import { walk } from 'zimmerframe'
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
            throw new SyntaxError('unknown object pattern syntax')
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
      throw new Error('unknown pattern syntax')
  }
}

export type Options = {
  enableThis?: boolean
  enableUpdate?: boolean
  enableDelete?: boolean
  enableInspect?: boolean
  enableFunctionCall?: boolean
}

export function traverse(
  tree: Expression,
  params: string[] = [],
  global?: string | 'this',
  {
    enableThis = false,
    enableUpdate = false,
    enableDelete = false,
    enableInspect = false,
    enableFunctionCall = true,
  }: Options = {},
): Expression {
  for (const [idx, param] of params.entries()) {
    if (!isIdent(param)) {
      throw new SyntaxError(`parameter name ${param} is not a valid identifier`)
    }
    if (params.indexOf(param, idx + 1) + 1) {
      throw new SyntaxError(`duplicate parameter name ${param}`)
    }
  }
  if (global != null && global !== 'this' && params.indexOf(global) === -1) {
    throw new SyntaxError(`global object name ${global} is not in parameter list`)
  }

  let error: Error | null = null

  const converted = walk(tree, [params], {
    _(node, { state, next, stop }) {
      function todo(cond: boolean, err: string): void {
        if (cond) {
          next(state)
        } else {
          error = new SyntaxError(err)
          stop()
        }
      }

      switch (node.type) {
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
          next(state)
          break
        case 'UnaryExpression':
        case 'BinaryExpression':
          return todo(
            (node.operator !== 'delete' || (enableUpdate && enableDelete)) &&
              ((node.operator !== 'typeof' &&
                node.operator !== 'in' &&
                node.operator !== 'instanceof') ||
                enableInspect),
            `operator ${node.operator} is disabled`,
          )
        case 'UpdateExpression':
        case 'AssignmentExpression':
          return todo(enableUpdate, `operator ${node.operator} is disabled`)
        case 'NewExpression':
        case 'CallExpression':
          return todo(enableFunctionCall, `function call is disabled`)
        case 'ThisExpression':
          return todo(enableThis, `this expression is disabled`)
        case 'FunctionExpression':
        case 'ClassExpression':
        case 'MetaProperty':
        case 'YieldExpression':
        case 'AwaitExpression':
        case 'ImportExpression':
          return todo(false, `expression type ${node.type} is not allowed`)
        default:
          return todo(false, `unknown node type ${(node as Node).type}`)
      }
    },
    ArrowFunctionExpression(node, { state, visit, stop }) {
      if (node.body.type === 'BlockStatement') {
        error = SyntaxError(`arrow function with block statement is not allowed`)
        stop()
      } else {
        const scope: string[] = []
        for (const p of node.params) {
          extractDeclaration(p, scope)
        }
        return {
          ...node,
          body: visit(node.body, [scope, ...state]),
        }
      }
    },
    MemberExpression(node, { state, visit }) {
      ok(node.object.type !== 'Super')
      ok(node.property.type !== 'PrivateIdentifier')

      return {
        ...node,
        object: visit(node.object, state),
        property: node.computed ? visit(node.property, state) : node.property,
      }
    },
    Identifier(node, { state, stop }) {
      for (const scope of state) {
        if (scope.indexOf(node.name) + 1) return
      }
      if (global == null) {
        error = new ReferenceError(`${node.name} is not defined`)
        stop()
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
        }
      }
    },
  })
  if (error) {
    throw error
  }
  return converted
}

export function compile(
  generate: (tree: Expression) => string,
  tree: Expression,
  params: string[] = [],
  global?: string,
  convertOption: Options = {},
): Function {
  const newTree = traverse(tree, params, global, convertOption)
  return new Function(...params, `'use strict';return ${generate(newTree)}`)
}
