"use strict";
module.exports={
    description:"合并后的编辑器与运行时扩展包",
    open_panel:"打开默认面板",
    send_to_panel:"向面板发送消息",
    hierarchy:{
        menu:{
            rootMenu:"构造视图成员(私有)",
            publicMenu:"构造视图成员(公共)",
            nodeMenu:"成员命名",
            assetMenu: {
                createAssetHandlerTitle: "创建资产句柄",
                createAssetHandler: {
                    hasAssetService: "创建资产句柄(有资产服务)",
                    noAssetService: "创建资产句柄(无资产服务)",
                    copyI18nfo: "复制i18n信息"
                }
            }
        },
        error:{
            noAssetInfo:"没有获取到资产信息",
            noBaseView:"没有找到BaseView组件"
        },
        nodeMenu:{
            setName:"成员命名"
        }
    },
    panels:{
        setName:"成员命名"
    },
    createTemplate:"创建模板",
    game_framework:"闪电/框架管理",
    i18n_conf_path:"i18n配置路径",
    i18n_conf_parse_start_row_col:"i18n配置解析起始行列(行-列)",
    i18n_conf_parse_end_row_col:"i18n配置解析结束行列(行-列)",
    i18n_conf_default_lan:"i18n配置默认语言",
    i18n_conf_refresh_after_save:"i18n配置保存后刷新",
};
