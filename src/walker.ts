import type { Node as AnyNode } from 'estree'

type Node = {
  type: string
}

function isNode(node: object): node is Node {
  return 'type' in node && typeof node.type === 'string'
}

export const ENTER = Symbol()
export const LEAVE = Symbol()

export function make_walker<N extends Node>() {
  type Visitor<T extends Node, S> = (node: T, state: S, next: (state?: S) => T) => N | null

  type Visitors<S> = {
    [T in N as T['type']]?: Visitor<T, S>
  } & {
    [ENTER]?: (node: Node, state: S) => S | undefined
    [LEAVE]?: (node: Node | null, state: S) => undefined
  }

  type BaseV<S, V> = keyof V extends keyof Visitors<S> ? Visitors<NoInfer<S>> : never

  return function <V extends BaseV<S, V>, S = undefined>(visitors: V, init_state?: S | (() => S)) {
    type VisitedType<T extends Node> = V[T['type']] extends (...args: never[]) => infer R ? R : T

    function new_state() {
      if (typeof init_state === 'function') {
        return (init_state as () => S)()
      } else {
        return init_state as S
      }
    }

    return function visit<T extends Node>(node: T, state = new_state()): VisitedType<T> {
      function next(next_state = state) {
        const mutations = []

        for (const key in node) {
          if (node[key] && typeof node[key] === 'object') {
            if (Array.isArray(node[key])) {
              const array_mutations = []

              for (const [idx, nod] of node[key].entries()) {
                if (nod && typeof nod === 'object' && isNode(nod)) {
                  const result = visit(nod, next_state)

                  if (result !== nod) {
                    array_mutations.push([idx, result] as const)
                  }
                }
              }
              if (array_mutations.length) {
                const child = [...node[key]]

                for (const [idx, nod] of array_mutations) {
                  child[idx] = nod
                }
                mutations.push([key, child] as const)
              }
            } else if (isNode(node[key])) {
              const result = visit(node[key], next_state)

              if (result !== node[key]) {
                mutations.push([key, result] as const)
              }
            }
          }
        }
        if (mutations.length) {
          const new_node = { ...node } as {
            [key: string]: unknown
          }

          for (const [key, child] of mutations) {
            new_node[key] = child
          }
          return new_node as T
        } else {
          return node
        }
      }

      if (visitors[ENTER]) {
        const enter_state = visitors[ENTER](node, state)
        if (enter_state !== undefined) {
          state = enter_state
        }
      }

      const visitor = visitors[node.type as T['type']] as Visitor<Node, S>
      const result = visitor ? visitor(node, state, next) : next()

      if (visitors[LEAVE]) {
        visitors[LEAVE](result, state)
      }

      return result as VisitedType<T>
    }
  }
}

export const walker = make_walker<AnyNode>()
