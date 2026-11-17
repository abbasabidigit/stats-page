import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    'aiux-acl|experience:stats-page|read|allow_if|admin': {
                        table: 'sys_security_acl'
                        id: '7833e3d1bc524b759d359d8e35c95aab'
                    }
                    'aiux-acl|x-alsoi-stats-dashboard|read|allow_if|admin': {
                        table: 'sys_security_acl'
                        id: '1d9c72b10fb1486383ca67215d02bb5e'
                    }
                    'aiux-acl|x-alsoi-stats-page-home-page|read|allow_if|admin': {
                        table: 'sys_security_acl'
                        id: '8d6056cbb8c74e7f9b33034ad77094bf'
                    }
                    'aiux-acl|x-alsoi-stats-page-stats-page|read|allow_if|admin': {
                        table: 'sys_security_acl'
                        id: 'cd23f3547f9a464d833645b7e2d42fcd'
                    }
                    'aiux-color-swatch|stats-page': {
                        table: 'sys_aix_color_swatch'
                        id: 'edc6fc8e8afc7e8ff8dcb3d7441adedd'
                    }
                    'aiux-experience-page-rel|x-alsoi-stats-page-home-page': {
                        table: 'sys_aix_experience_page_rel'
                        id: '0023ed562a0ee48ddfd1819f27a643a1'
                    }
                    'aiux-experience-page-rel|x-alsoi-stats-page-stats-page': {
                        table: 'sys_aix_experience_page_rel'
                        id: 'a97958e801d35d15eb76564d999d1a72'
                    }
                    'aiux-experience-prop|appHeadCss': {
                        table: 'sys_aix_experience_properties'
                        id: 'fcdbf901b2383d5bfbf3bf000f37eeca'
                    }
                    'aiux-experience-prop|appPlatform': {
                        table: 'sys_aix_experience_properties'
                        id: '1f24d9a76d3d7481c75949150cebf365'
                    }
                    'aiux-experience-prop|appTailwindCss': {
                        table: 'sys_aix_experience_properties'
                        id: '02f6c6e67bf7eff6bfeb12b5b7437f6a'
                    }
                    'aiux-experience|stats-page': {
                        table: 'sys_aix_experience'
                        id: '481a7a1cef22bc87f897f7d1b290e16a'
                    }
                    'aiux-layout-widget|lifecycle': {
                        table: 'sys_aix_widget'
                        id: 'e9e728437b4764cca48904a6e01f4ef9'
                    }
                    'aiux-page-widget|x-alsoi-stats-page-home-page': {
                        table: 'sys_aix_widget'
                        id: 'ef61d8d4947f6e78266cd21eb427ae03'
                    }
                    'aiux-page-widget|x-alsoi-stats-page-stats-page': {
                        table: 'sys_aix_widget'
                        id: 'f1da49937694eafba9403d5ec6bf9f2c'
                    }
                    'aiux-page|x-alsoi-stats-page-home-page': {
                        table: 'sys_aix_page'
                        id: '3480369e6b1f97991bd26e6f1db73a7c'
                    }
                    'aiux-page|x-alsoi-stats-page-stats-page': {
                        table: 'sys_aix_page'
                        id: 'cee1829dda0adc21dd4314aca8a00f9f'
                    }
                    'aiux-project|x_alsoi_stats_page_stats_page': {
                        table: 'sys_aix_project'
                        id: '4a3e0eddac384d2c47c8b7a21752ab60'
                    }
                    'aiux-theme|stats-page': {
                        table: 'sys_aix_theme'
                        id: '7ded0d6776b202188ef9543d8db48d68'
                    }
                    'aiux-widget|x-alsoi-stats-dashboard': {
                        table: 'sys_aix_widget'
                        id: '3e918a8693e4fc3b0b754acf49e49221'
                    }
                    bom_json: {
                        table: 'sys_module'
                        id: '90f45f3646d64464a5b64dd3b46a6b13'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '3cd6e5ae32f24c34a8e46c7d7d28cff0'
                    }
                    'sys-analytics-app|stats-page': {
                        table: 'sys_analytics_app'
                        id: '41fd5d9fa4d65818e1b8f5116b50976e'
                    }
                }
                composite: [
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '14e54c8afc78455286401f89cdc44988'
                        key: {
                            application_file: '4a3e0eddac384d2c47c8b7a21752ab60'
                            source_artifact: '27a6c90153244b3291ab94d90cdc6ce5'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '1dff0f95c50e4fc9a290104894688772'
                        key: {
                            sys_security_acl: 'cd23f3547f9a464d833645b7e2d42fcd'
                            sys_user_role: {
                                id: '71834698e7d44314bfc6b51c224bf36a'
                                key: {
                                    name: 'admin'
                                }
                            }
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact'
                        id: '27a6c90153244b3291ab94d90cdc6ce5'
                        key: {
                            name: 'aiux-source 4a3e0eddac384d2c47c8b7a21752ab60'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '70a026fa7f414f21a6c1614a4880f257'
                        key: {
                            sys_security_acl: '1d9c72b10fb1486383ca67215d02bb5e'
                            sys_user_role: {
                                id: '71834698e7d44314bfc6b51c224bf36a'
                                key: {
                                    name: 'admin'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '978023d4f2cf4ef098fcc34b23dba68b'
                        key: {
                            sys_security_acl: '8d6056cbb8c74e7f9b33034ad77094bf'
                            sys_user_role: {
                                id: '71834698e7d44314bfc6b51c224bf36a'
                                key: {
                                    name: 'admin'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: 'c4975877c32746848ab6b759f866b649'
                        key: {
                            sys_security_acl: '7833e3d1bc524b759d359d8e35c95aab'
                            sys_user_role: {
                                id: '71834698e7d44314bfc6b51c224bf36a'
                                key: {
                                    name: 'admin'
                                }
                            }
                        }
                    },
                ]
            }
        }
    }
}
