import { nextTick } from 'vue'
import XEUtils from 'xe-utils/ctor'
import { UtilTools, DomTools } from '../../tools'

import { VxeGlobalHooksHandles, TableValidatorMethods, TableValidatorPrivateMethods } from '../../../types/vxe-table'

/**
 * 校验规则
 */
class Rule {
  constructor (rule: any) {
    Object.assign(this, {
      $options: rule,
      required: rule.required,
      min: rule.min,
      max: rule.max,
      type: rule.type,
      pattern: rule.pattern,
      validator: rule.validator,
      trigger: rule.trigger,
      maxWidth: rule.maxWidth
    })
  }

  /**
   * 获取校验不通过的消息
   * 支持国际化翻译
   */
  get message () {
    return UtilTools.getFuncText(this.$options.message)
  }

  [key: string]: any
}

const tableValidatorMethodKeys: (keyof TableValidatorMethods)[] = ['fullValidate', 'validate', 'clearValidate']

const validatorHook: VxeGlobalHooksHandles.HookOptions = {
  setupTable ($xetable) {
    const { props, reactData, internalData, refMaps, computeMaps } = $xetable
    const { refValidTooltip } = refMaps
    const { computeValidOpts, computeTreeOpts, computeEditOpts } = computeMaps

    let validatorMethods = {} as TableValidatorMethods
    let validatorPrivateMethods = {} as TableValidatorPrivateMethods

    let validRuleErr: boolean

    /**
     * 聚焦到校验通过的单元格并弹出校验错误提示
     */
    const handleValidError = (params: any) => {
      const validOpts = computeValidOpts.value
      if (validOpts.autoPos === false) {
        $xetable.dispatchEvent('valid-error', params, null)
      } else {
        $xetable.handleActived(params, { type: 'valid-error', trigger: 'call' })
          .then(() => setTimeout(() => validatorPrivateMethods.showValidTooltip(params), 10))
      }
    }

    /**
     * 对表格数据进行校验
     * 如果不指定数据，则默认只校验临时变动的数据，例如新增或修改
     * 如果传 true 则校验当前表格数据
     * 如果传 row 指定行记录，则只验证传入的行
     * 如果传 rows 为多行记录，则只验证传入的行
     * 如果只传 callback 否则默认验证整个表格数据
     * 返回 Promise 对象，或者使用回调方式
     */
    const beginValidate = (rows: any, cb: any, isFull?: boolean): Promise<any> => {
      const validRest: any = {}
      const { editRules, treeConfig } = props
      const { afterFullData } = internalData
      const treeOpts = computeTreeOpts.value
      const validOpts = computeValidOpts.value
      let vaildDatas
      if (rows === true) {
        vaildDatas = afterFullData
      } else if (rows) {
        if (XEUtils.isFunction(rows)) {
          cb = rows
        } else {
          vaildDatas = XEUtils.isArray(rows) ? rows : [rows]
        }
      }
      if (!vaildDatas) {
        if ($xetable.getInsertRecords) {
          vaildDatas = $xetable.getInsertRecords().concat($xetable.getUpdateRecords())
        } else {
          vaildDatas = []
        }
      }
      const rowValids: any = []
      internalData._lastCallTime = Date.now()
      validRuleErr = false // 如果为快速校验，当存在某列校验不通过时将终止执行
      validatorMethods.clearValidate()
      if (editRules) {
        const columns = $xetable.getColumns()
        const handleVaild = (row: any) => {
          if (isFull || !validRuleErr) {
            const colVailds: any[] = []
            columns.forEach((column: any) => {
              if ((isFull || !validRuleErr) && XEUtils.has(editRules, column.property)) {
                colVailds.push(
                  validatorPrivateMethods.validCellRules('all', row, column)
                    .catch(({ rule, rules }: any) => {
                      const rest = {
                        rule,
                        rules,
                        rowIndex: $xetable.getRowIndex(row),
                        row,
                        columnIndex: $xetable.getColumnIndex(column),
                        column,
                        $table: $xetable
                      }
                      if (!validRest[column.property]) {
                        validRest[column.property] = []
                      }
                      validRest[column.property].push(rest)
                      if (!isFull) {
                        validRuleErr = true
                        return Promise.reject(rest)
                      }
                    })
                )
              }
            })
            rowValids.push(Promise.all(colVailds))
          }
        }
        if (treeConfig) {
          XEUtils.eachTree(vaildDatas, handleVaild, treeOpts)
        } else {
          vaildDatas.forEach(handleVaild)
        }
        return Promise.all(rowValids).then(() => {
          const ruleProps = Object.keys(validRest)
          if (ruleProps.length) {
            return Promise.reject(validRest[ruleProps[0]][0])
          }
          if (cb) {
            cb()
          }
        }).catch(firstErrParams => {
          return new Promise((resolve, reject) => {
            const finish = () => {
              if (cb) {
                cb(validRest)
                resolve()
              } else {
                reject(validRest)
              }
            }
            const posAndFinish = () => {
              firstErrParams.cell = $xetable.getCell(firstErrParams.row, firstErrParams.column)
              DomTools.toView(firstErrParams.cell)
              handleValidError(firstErrParams)
              finish()
            }
            /**
             * 当校验不通过时
             * 将表格滚动到可视区
             * 由于提示信息至少需要占一行，定位向上偏移一行
             */
            const row = firstErrParams.row
            const rowIndex = afterFullData.indexOf(row)
            const locatRow = rowIndex > 0 ? afterFullData[rowIndex - 1] : row
            if (validOpts.autoPos === false) {
              finish()
            } else {
              if (treeConfig) {
                $xetable.scrollToTreeRow(locatRow).then(posAndFinish)
              } else {
                $xetable.scrollToRow(locatRow).then(posAndFinish)
              }
            }
          })
        })
      }
      if (cb) {
        cb()
      }
      return Promise.resolve()
    }

    validatorMethods = {
      /**
       * 完整校验，和 validate 的区别就是会给有效数据中的每一行进行校验
       */
      fullValidate (rows, cb) {
        const { afterFullData } = internalData
        if (XEUtils.isFunction(rows)) {
          return beginValidate(afterFullData, cb, true)
        }
        return beginValidate(rows || afterFullData, cb, true)
      },
      /**
       * 快速校验，如果存在记录不通过的记录，则返回不再继续校验（异步校验除外）
       */
      validate (rows, cb) {
        return beginValidate(rows, cb)
      },
      clearValidate () {
        const { validStore } = reactData
        const validTip = refValidTooltip.value
        Object.assign(validStore, {
          visible: false,
          row: null,
          column: null,
          content: '',
          rule: null
        })
        if (validTip && validTip.reactData.visible) {
          validTip.close()
        }
        return nextTick()
      }
    }

    validatorPrivateMethods = {
      /**
       * 校验数据
       * 按表格行、列顺序依次校验（同步或异步）
       * 校验规则根据索引顺序依次校验，如果是异步则会等待校验完成才会继续校验下一列
       * 如果校验失败则，触发回调或者Promise<不通过列的错误消息>
       * 如果是传回调方式这返回一个校验不通过列的错误消息
       *
       * rule 配置：
       *  required=Boolean 是否必填
       *  min=Number 最小长度
       *  max=Number 最大长度
       *  validator=Function({ cellValue, rule, rules, row, column, rowIndex, columnIndex }) 自定义校验，接收一个 Promise
       *  trigger=blur|change 触发方式（除非特殊场景，否则默认为空就行）
       */
      validCellRules (type, row, column, val) {
        const { editRules } = props
        const { property } = column
        const errorRules: any[] = []
        const syncVailds: any[] = []
        if (property && editRules) {
          const rules = XEUtils.get(editRules, property)
          if (rules) {
            const cellValue = XEUtils.isUndefined(val) ? XEUtils.get(row, property) : val
            rules.forEach((rule: any) => {
              if (type === 'all' || !rule.trigger || type === rule.trigger) {
                if (XEUtils.isFunction(rule.validator)) {
                  const customValid = rule.validator({
                    cellValue,
                    rule,
                    rules,
                    row,
                    rowIndex: $xetable.getRowIndex(row),
                    column,
                    columnIndex: $xetable.getColumnIndex(column),
                    $table: $xetable
                  })
                  if (customValid) {
                    if (XEUtils.isError(customValid)) {
                      validRuleErr = true
                      errorRules.push(new Rule({ type: 'custom', trigger: rule.trigger, message: customValid.message, rule: new Rule(rule) }))
                    } else if (customValid.catch) {
                      // 如果为异步校验（注：异步校验是并发无序的）
                      syncVailds.push(
                        customValid.catch((e: any) => {
                          validRuleErr = true
                          errorRules.push(new Rule({ type: 'custom', trigger: rule.trigger, message: e ? e.message : rule.message, rule: new Rule(rule) }))
                        })
                      )
                    }
                  }
                } else {
                  const isNumType = rule.type === 'number'
                  const isArrType = rule.type === 'array'
                  const numVal = isNumType ? XEUtils.toNumber(cellValue) : XEUtils.getSize(cellValue)
                  if (rule.required && (isArrType ? (!XEUtils.isArray(cellValue) || !cellValue.length) : (cellValue === null || cellValue === undefined || cellValue === ''))) {
                    validRuleErr = true
                    errorRules.push(new Rule(rule))
                  } else if (
                    (isNumType && isNaN(cellValue)) ||
                    (!isNaN(rule.min) && numVal < parseFloat(rule.min)) ||
                    (!isNaN(rule.max) && numVal > parseFloat(rule.max)) ||
                    (rule.pattern && !(rule.pattern.test ? rule.pattern : new RegExp(rule.pattern)).test(cellValue))
                  ) {
                    validRuleErr = true
                    errorRules.push(new Rule(rule))
                  }
                }
              }
            })
          }
        }
        return Promise.all(syncVailds).then(() => {
          if (errorRules.length) {
            const rest = { rules: errorRules, rule: errorRules[0] }
            return Promise.reject(rest)
          }
        })
      },
      hasCellRules (type, row, column) {
        const { editRules } = props
        const { property } = column
        if (property && editRules) {
          const rules = XEUtils.get(editRules, property)
          return rules && !!XEUtils.find(rules, rule => type === 'all' || !rule.trigger || type === rule.trigger)
        }
        return false
      },
      /**
       * 触发校验
       */
      triggerValidate (type) {
        const { editConfig, editRules } = props
        const { editStore, validStore } = reactData
        const { actived } = editStore
        const editOpts = computeEditOpts.value
        if (editConfig && editRules && actived.row) {
          const { row, column, cell } = actived.args
          if (validatorPrivateMethods.hasCellRules(type, row, column)) {
            return validatorPrivateMethods.validCellRules(type, row, column).then(() => {
              if (editOpts.mode === 'row') {
                if (validStore.visible && validStore.row === row && validStore.column === column) {
                  validatorMethods.clearValidate()
                }
              }
            }).catch(({ rule }: any) => {
              // 如果校验不通过与触发方式一致，则聚焦提示错误，否则跳过并不作任何处理
              if (!rule.trigger || type === rule.trigger) {
                const rest = { rule, row, column, cell }
                validatorPrivateMethods.showValidTooltip(rest)
                return Promise.reject(rest)
              }
              return Promise.resolve()
            })
          }
        }
        return Promise.resolve()
      },
      /**
       * 弹出校验错误提示
       */
      showValidTooltip (params) {
        const { height } = props
        const { tableData, validStore } = reactData
        const validOpts = computeValidOpts.value
        const { rule, row, column, cell } = params
        const validTip = refValidTooltip.value
        const content = rule.message
        nextTick(() => {
          Object.assign(validStore, {
            row,
            column,
            rule,
            content,
            visible: true
          })
          if (validTip && (validOpts.message === 'tooltip' || (validOpts.message === 'default' && !height && tableData.length < 2))) {
            validTip.open(cell, content)
          }
          $xetable.dispatchEvent('valid-error', params, null)
        })
      }
    }

    return { ...validatorMethods, ...validatorPrivateMethods }
  },
  setupGrid ($xegrid) {
    return $xegrid.extendTableMethods(tableValidatorMethodKeys)
  }
}

export default validatorHook
