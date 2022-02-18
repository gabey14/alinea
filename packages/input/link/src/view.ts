import {Field} from '@alinea/core'
import {createLink} from './LinkField'
import {LinkInput} from './LinkInput'
export * from './LinkField'
export * from './LinkInput'
export const link = Field.withView(createLink, LinkInput)