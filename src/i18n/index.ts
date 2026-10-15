// English dictionaries, keyed by the Russian source string.
import { EN_A } from './en-a'
import { EN_B } from './en-b'
import { EN_C } from './en-c'
import { EN_D } from './en-d'
import { EN_E } from './en-e'

export const EN: Record<string, string> = { ...EN_A, ...EN_B, ...EN_C, ...EN_D, ...EN_E }
