import '../style/list.less'

import Context from '../Context'
import * as Utils from '../lib/utils'
import * as Ui from '../lib/ui'
import Api from '../lib/api'
import ListHTML from './html/list.html?raw'
import ListLite from './ListLite'
import { ListData } from '~/types/artalk-data'

export default class List extends ListLite {
  private closeCommentBtnEl!: HTMLElement
  private openSidebarBtnEl!: HTMLElement
  private openAdminPanelBtnEl!: HTMLElement
  private unreadBadgeEl!: HTMLElement

  constructor (ctx: Context) {
    super(ctx)

    const el = Utils.createElement(ListHTML)
    el.querySelector('.atk-list-body')!.append(this.el)
    this.el = el

    // 操作按钮
    this.initListActionBtn()

    this.el.querySelector<HTMLElement>('.atk-copyright')!.innerHTML = `Powered By <a href="https://artalk.js.org" target="_blank" title="Artalk v${ARTALK_VERSION}">Artalk</a>`

    this.ctx.addEventListener('list-reload', () => (this.reqComments(0))) // 刷新评论
    this.ctx.addEventListener('list-clear', () => (this.clearComments())) // 清空评论
    this.ctx.addEventListener('list-refresh-ui', () => (this.refreshUI()))
    this.ctx.addEventListener('list-import', (data) => (this.importComments(data)))
    this.ctx.addEventListener('list-insert', (data) => (this.insertComment(data)))
    this.ctx.addEventListener('list-comment-del', (comment) => (this.deleteComment(comment.id)))
    this.ctx.addEventListener('list-update-data', (updateData) => { updateData(this.data);this.refreshUI() } )
    this.ctx.addEventListener('unread-update', (data) => (this.showUnreadBadge(data.notifies?.length || 0)))
  }

  /** 刷新界面 */
  public refreshUI () {
    super.refreshUI()

    this.el.querySelector<HTMLElement>('.atk-comment-count-num')!.innerText = String(this.getListCommentCount())

    // 已输入个人信息
    if (!!this.ctx.user.data.nick && !!this.ctx.user.data.email) {
      this.openSidebarBtnEl.classList.remove('atk-hide')
    } else {
      this.openSidebarBtnEl.classList.add('atk-hide')
    }

    // 仅管理员显示控制
    this.ctx.dispatchEvent('check-admin-show-el')

    // 关闭评论
    if (!!this.data && !!this.data.page && this.data.page.admin_only === true) {
      this.ctx.dispatchEvent('editor-close-comment')
      this.closeCommentBtnEl.innerHTML = '打开评论'
    } else {
      this.ctx.dispatchEvent('editor-open-comment')
      this.closeCommentBtnEl.innerHTML = '关闭评论'
    }
  }

  public onLoad(data: ListData) {
    super.onLoad(data)

    // 检测锚点跳转
    this.checkGoToCommentByUrlHash()
  }

  /** 跳到评论项位置 - 根据 `location.hash` */
  public async checkGoToCommentByUrlHash () {
    let commentId = Number(Utils.getQueryParam('atk_comment')) // same as backend GetReplyLink()
    if (!commentId) {
      const match = window.location.hash.match(/#atk-comment-([0-9]+)/)
      if (!match || !match[1] || Number.isNaN(Number(match[1]))) return
      commentId = Number(match[1])
    }
    if (!commentId) return

    const comment = this.findComment(commentId)
    if (!comment) { // 若找不到评论
      if (this.hasMoreComments) { // 阅读更多，并重试
        await this.readMore()
      }
    }

    if (!comment) return

    Ui.scrollIntoView(comment.getEl(), false)
    setTimeout(() => {
      comment.getEl().classList.add('atk-flash-once')

      // 已阅 API
      const notifyKey = Utils.getQueryParam('atk_notify_key')
      if (notifyKey) {
        new Api(this.ctx).markRead(notifyKey)
          .then(() => {
            this.unread = this.unread.filter(o => o.comment_id !== comment.data.id)
            this.ctx.dispatchEvent('unread-update', {
              notifies: this.unread
            })
          })
      }
    }, 800)
  }

  private initListActionBtn () {
    // 侧边栏呼出按钮
    this.openSidebarBtnEl = this.el.querySelector('[data-action="open-sidebar"]')!
    this.openSidebarBtnEl.addEventListener('click', () => {
      this.ctx.dispatchEvent('sidebar-show', { viewName: 'message' })
    })

    // 控制台呼出
    this.openAdminPanelBtnEl = this.el.querySelector('[data-action="open-admin-panel"]')!
    this.openAdminPanelBtnEl.addEventListener('click', () => {
      this.ctx.dispatchEvent('sidebar-show', { viewName: 'admin' })
    })


    // 关闭评论按钮
    this.closeCommentBtnEl = this.el.querySelector('[data-action="admin-close-comment"]')!
    this.closeCommentBtnEl.addEventListener('click', () => {
      if (!this.data) return

      this.data.page.admin_only = !this.data.page.admin_only
      this.adminPageEditSave()
    })

    this.unreadBadgeEl = this.el.querySelector('.atk-unread-badge')!
  }

  /** 管理员设置页面信息 */
  public adminPageEditSave () {
    if (!this.data || !this.data.page) return

    this.ctx.dispatchEvent('editor-show-loading')
    new Api(this.ctx).pageEdit(this.data.page)
      .then((page) => {
        if (this.data)
          this.data.page = { ...page }
        this.refreshUI()
      })
      .catch(err => {
        this.ctx.dispatchEvent('editor-notify', { msg: `修改页面数据失败：${err.msg || String(err)}`, type: 'e'})
      })
      .finally(() => {
        this.ctx.dispatchEvent('editor-hide-loading')
      })
  }

  public showUnreadBadge (count: number) {
    if (count > 0) {
      this.unreadBadgeEl.innerText = `${Number(count || 0)}`
      this.unreadBadgeEl.style.display = 'block'
    } else {
      this.unreadBadgeEl.style.display = 'none'
    }
  }
}
