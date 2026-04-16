import {
  Q_ASCII_MARK_LABEL,
  Q_ASCII_MARK_LINES,
} from '../src/components/LogoV2/qMarkData.js'

const rawBlock = [...Q_ASCII_MARK_LINES, '', Q_ASCII_MARK_LABEL].join('\n')
const markdownBlock = ['```text', rawBlock, '```'].join('\n')

console.log('RAW_Q_MARK_START')
console.log(rawBlock)
console.log('RAW_Q_MARK_END')
console.log('MARKDOWN_Q_MARK_START')
console.log(markdownBlock)
console.log('MARKDOWN_Q_MARK_END')
