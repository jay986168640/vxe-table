import XEUtils from 'xe-utils/ctor'
import GlobalConfig from '../../conf'

import { VxeTableConstructor } from '../../../types/vxe-table'

let zindexIndex = 0
let lastZindex = 1

function getColFuncWidth (isExists: any, defaultWidth = 16) {
  return isExists ? defaultWidth : 0
}

function getLog (message: string, params?: any) {
  return `[vxe-table] ${GlobalConfig.i18n(message, params)}`
}

function outLog (type: 'log' | 'warn' | 'error') {
  return function (message: string, params?: any) {
    const msg = getLog(message, params)
    console[type](msg)
    return msg
  }
}

export const UtilTools = {
  warn: outLog('warn'),
  error: outLog('error'),
  getLog: getLog,
  getFuncText (content?: string | number | null) {
    return content ? XEUtils.toString(GlobalConfig.translate ? GlobalConfig.translate('' + content) : content) : ''
  },
  nextZIndex () {
    lastZindex = GlobalConfig.zIndex + zindexIndex++
    return lastZindex
  },
  getLastZIndex () {
    return lastZindex
  },
  // 获取所有的列，排除分组
  getColumnList (columns: any) {
    const result: any[] = []
    columns.forEach((column: any) => {
      result.push(...(column.children && column.children.length ? UtilTools.getColumnList(column.children) : [column]))
    })
    return result
  },
  toFilters (filters: any) {
    if (filters && XEUtils.isArray(filters)) {
      return filters.map(({ label, value, data, resetValue, checked }) => {
        return { label, value, data, resetValue, checked: !!checked, _checked: !!checked }
      })
    }
    return filters
  },
  getClass (property: any, params: any) {
    return property ? XEUtils.isFunction(property) ? property(params) : property : ''
  },
  formatText (value: any, placeholder?: any) {
    return '' + (value === '' || value === null || value === undefined ? (placeholder ? GlobalConfig.emptyCell : '') : value)
  },
  getCellValue (row: any, column: any) {
    return XEUtils.get(row, column.property)
  },
  setCellValue (row: any, column: any, value: any) {
    return XEUtils.set(row, column.property, value)
  },
  hasChildrenList (item: any) {
    return item && item.children && item.children.length > 0
  },
  getColMinWidth ($xetable: VxeTableConstructor, column: any) {
    const { computeMaps } = $xetable
    const { computeSortOpts, computeFilterOpts, computeEditOpts } = computeMaps
    const sortOpts = computeSortOpts.value
    const filterOpts = computeFilterOpts.value
    const editOpts = computeEditOpts.value
    const { type, filters, sortable, editRender, titleHelp } = column
    return 40 + getColFuncWidth(type === 'checkbox', 18) + getColFuncWidth(titleHelp, 18) + getColFuncWidth(filters && filterOpts.showIcon) + getColFuncWidth((sortable) && sortOpts.showIcon) + getColFuncWidth(editRender && editOpts.showIcon, 32)
  },
  parseFile (file: any) {
    const name = file.name
    const tIndex = XEUtils.lastIndexOf(name, '.')
    const type = name.substring(tIndex + 1, name.length)
    const filename = name.substring(0, tIndex)
    return { filename, type }
  },
  isNumVal (num: string | number): num is number {
    return !isNaN(parseFloat('' + num))
  }
}

export default UtilTools
