"use strict";
module.exports={
    description:"Merged editor and runtime extension package",
    open_panel:"Open Default Panel",
    send_to_panel:"Send Message To Panel",
    hierarchy:{
        menu:{
            rootMenu:"Create View Members (Private)",
            publicMenu:"Create View Members (Public)",
            nodeMenu:"Set Member Name",
            assetMenu: {
               createAssetHandlerTitle: "Create Asset Handle",
               createAssetHandler: {
                   hasAssetService: "Create Asset Handle (With Asset Service)",
                   noAssetService: "Create Asset Handle (Without Asset Service)",
                   copyI18nfo: "Copy i18n Info"
               }
            }
        },
        error:{
            noAssetInfo:"No asset info",
            noBaseView:"No BaseView component"
        },
        nodeMenu:{
            setName:"Set Member Name"
        }
    },
    panels:{
        setName:"Set Member Name"
    },
    createTemplate:"Create Template",
    game_framework:"ksgames26/framework management",
    i18n_conf_path:"i18n configuration path",
    i18n_conf_parse_start_row_col:"i18n configuration parse start row and column(row-column)",
    i18n_conf_parse_end_row_col:"i18n configuration parse end row and column(row-column)",
    i18n_conf_default_lan:"i18n configuration default language",
    i18n_conf_refresh_after_save:"i18n configuration refresh after saving",
};
