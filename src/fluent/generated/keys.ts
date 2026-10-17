import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: 'dd4d7a33d2304be4b667d73673eb2ff0'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: 'a4789771491d4aa193ef80de35899499'
                    }
                    'src_server_templater-api_ts': {
                        table: 'sys_module'
                        id: '76083dac67b04647ace1a16a153251fa'
                    }
                    'starter-cab-review': {
                        table: 'x_1040823_template_template'
                        id: '7815e20295c74400808ecaf60dcb4310'
                    }
                    'starter-change-request': {
                        table: 'x_1040823_template_template'
                        id: '96ea8a85a7b34afd83641b4f62611f08'
                    }
                    'starter-incident-report': {
                        table: 'x_1040823_template_template'
                        id: '4dd5612acb374118b1caf5f8c39b06d8'
                    }
                    'starter-major-incident-review': {
                        table: 'x_1040823_template_template'
                        id: '467bd4269c5248c391395450172a9a98'
                    }
                    'starter-problem-report': {
                        table: 'x_1040823_template_template'
                        id: '77f8a82af8b74ae1bb3a8e8ae18acd3d'
                    }
                    'starter-requested-item': {
                        table: 'x_1040823_template_template'
                        id: '11f0b8fb29304e8aac27ffe461c9f18e'
                    }
                    'styles/controls.css': {
                        table: 'sys_ux_theme_asset'
                        id: '9f0db9283ec9467881460f071c4796f2'
                    }
                    'template-create': {
                        table: 'sys_security_acl'
                        id: '5d4ed6c6b05c4e81a01caebd4eae0a32'
                    }
                    'template-delete': {
                        table: 'sys_security_acl'
                        id: '6e49ec2773774ae59d754245dc38d815'
                    }
                    'template-read': {
                        table: 'sys_security_acl'
                        id: '6c451393abe64a8dbffda075d5daaafa'
                    }
                    'template-write': {
                        table: 'sys_security_acl'
                        id: '6ea6936fce374ffbb9c0278a0af6374e'
                    }
                    'templater-api': {
                        table: 'sys_ws_definition'
                        id: 'ffb509f6979646ea8797671d25e745b2'
                    }
                    'templater-api-me': {
                        table: 'sys_ws_operation'
                        id: 'd497b188b3c6457c855ff6ffc517a984'
                    }
                    'templater-api-schema': {
                        table: 'sys_ws_operation'
                        id: '2e79a1138d9d48078de31dd83be0af48'
                    }
                    'templater-api-tables': {
                        table: 'sys_ws_operation'
                        id: '19830c48863449dcb2948a1077007522'
                    }
                    'templater-form-export': {
                        table: 'sys_ui_action'
                        id: '46af67f5726d4f8eb02b920731f1823e'
                    }
                    'templater-list-export': {
                        table: 'sys_ui_action'
                        id: '87bb71396fcf4877884ee55ed986666a'
                    }
                    'templater-menu': {
                        table: 'sys_app_application'
                        id: '530fe858406b49aeb0955e2733ced0c8'
                    }
                    'templater-module-export': {
                        table: 'sys_app_module'
                        id: '88a841f9c4734ce8b2713a54739f02c8'
                    }
                    'templater-module-present': {
                        table: 'sys_app_module'
                        id: 'dc1b811fdaa04cf09fbf2757a1d5085b'
                    }
                    'templater-module-table': {
                        table: 'sys_app_module'
                        id: '6d6a9aaf238c4a02afedf6f707784753'
                    }
                    'templater-module-templates': {
                        table: 'sys_app_module'
                        id: '03fa1c70d5234d88aff0304e1dc5b91f'
                    }
                    'templater-utils': {
                        table: 'sys_script_include'
                        id: 'c99dd377d98b4d6c8f404babc3c1189e'
                    }
                }
                composite: [
                    {
                        table: 'sys_documentation'
                        id: '025812dc7a504d379e3313fd0ac73f86'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'active'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '09f8af9705c54048a0b31accfb12087c'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'active'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '0d869913736645aa84f924a0a4395e63'
                        key: {
                            sys_security_acl: '5d4ed6c6b05c4e81a01caebd4eae0a32'
                            sys_user_role: {
                                id: '37def2dd69894fbcbb65bab042e3de06'
                                key: {
                                    name: 'x_1040823_template.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '12acd9f4ffc54a0ebc3bf66cf113c512'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'order_by'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: '1746cba495844aa991291b61717ffc62'
                        key: {
                            name: 'x_1040823_template_template'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '1d72cd7e362f40739014ba0a643b7c0e'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'order_by'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_user_role_contains'
                        id: '2018284f7435469694773f1e8b510469'
                        key: {
                            role: {
                                id: '37def2dd69894fbcbb65bab042e3de06'
                                key: {
                                    name: 'x_1040823_template.editor'
                                }
                            }
                            contains: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: '20216a1436a848f28ee0f8327e2399fb'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'kind'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '2681b57f0f664e76ad0ba1105aee8def'
                        key: {
                            application_file: '65be534e7d084438bb49dd30dacc3ee8'
                            source_artifact: 'e5bcc6f993c94226b870d9e9acf10294'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '2b48ca8dc5c740629f23475bf8d4b27e'
                        key: {
                            application_file: 'c6a4217295254d86800bcbb627a7aa53'
                            source_artifact: 'e5bcc6f993c94226b870d9e9acf10294'
                        }
                    },
                    {
                        table: 'sys_user_role'
                        id: '37def2dd69894fbcbb65bab042e3de06'
                        key: {
                            name: 'x_1040823_template.editor'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '3c64c9722c4e4e5ba5fedf9901a1bee8'
                        key: {
                            application_file: 'eeb3f4d9b2754173a88a80396c19334f'
                            source_artifact: 'e5bcc6f993c94226b870d9e9acf10294'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '3e59405d6d504842a1f3a9e85a4d20ad'
                        key: {
                            sys_security_acl: '6e49ec2773774ae59d754245dc38d815'
                            sys_user_role: {
                                id: '37def2dd69894fbcbb65bab042e3de06'
                                key: {
                                    name: 'x_1040823_template.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '452f9201e8c141d7a2bd37d6c91c5dc2'
                        key: {
                            name: 'x_1040823_template/main'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: '5564dc9ca55b45838a03081a98c40d42'
                        key: {
                            name: 'x_1040823_template_template'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '63ea24ad27c84d25aeb8e178684b114d'
                        key: {
                            name: 'x_1040823_template/main.js.map'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '65be534e7d084438bb49dd30dacc3ee8'
                        key: {
                            name: 'x_1040823_template/vendor-react-dom--63c1820d'
                        }
                    },
                    {
                        table: 'sys_ui_action_role'
                        id: '65d35239a0ac4b6083c39f09a2041bbe'
                        key: {
                            sys_ui_action: '46af67f5726d4f8eb02b920731f1823e'
                            sys_user_role: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '692a3960a43e4766bf3f77cb59e25110'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '78032b925ff141918a8b89591ac4db13'
                        key: {
                            application_file: '63ea24ad27c84d25aeb8e178684b114d'
                            source_artifact: 'e5bcc6f993c94226b870d9e9acf10294'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '78e0486acf7a40ccab149c0c40a0ed8d'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'description'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_user_role'
                        id: '7b02ab47838d484c8e20dc95771aca97'
                        key: {
                            name: 'x_1040823_template.user'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '8477affe642d4d19999d243f21e37f06'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'record_limit'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '912625c2e78d44cabff1b87a5dbe8cfe'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'table'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '9200fad7bb364ee9ac1211ed054a8e7c'
                        key: {
                            sys_security_acl: '6c451393abe64a8dbffda075d5daaafa'
                            sys_user_role: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '938f78bbc0fc49bb8f1a22a9a259fbfc'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'kind'
                            value: 'deck'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '962d207b63af4ce39fc93b332d3f3e76'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'NULL'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '9f6ee7df9434420aa0cef3c1d3b1b0c0'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'kind'
                            value: 'document'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'a4ef5e93426941b1be77c2d1fa9bd23d'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'body'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'b549e9186cba427683ba908f9453a5d5'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'description'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'ba3274985a564e27a85d31c12d392d37'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_ui_page'
                        id: 'c6a4217295254d86800bcbb627a7aa53'
                        key: {
                            endpoint: 'x_1040823_template_templater.do'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'c72f12c7e2114ec593a76a7e11086503'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'query'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'cec6ff2b79044f13be7b10c26b63743e'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'query'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: 'da5bc13159d24360ae557c22173337c4'
                        key: {
                            sys_security_acl: '6ea6936fce374ffbb9c0278a0af6374e'
                            sys_user_role: {
                                id: '37def2dd69894fbcbb65bab042e3de06'
                                key: {
                                    name: 'x_1040823_template.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e308a6fb692f4391aff579d8a43bc875'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'record_limit'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e40f2f660b9247e2a7d500d43063e77b'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'kind'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact'
                        id: 'e5bcc6f993c94226b870d9e9acf10294'
                        key: {
                            name: 'x_1040823_template_templater.do - BYOUI Files'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'edf7085bff494be9820c941f16257f99'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'kind'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'eeb3f4d9b2754173a88a80396c19334f'
                        key: {
                            name: 'x_1040823_template/vendor-react-dom--63c1820d.js.map'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'f7e1b2f078064d81ab67a7bffc4428bf'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'name'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: 'fd165c1174914a74bfe99f43bee1206a'
                        key: {
                            application_file: '452f9201e8c141d7a2bd37d6c91c5dc2'
                            source_artifact: 'e5bcc6f993c94226b870d9e9acf10294'
                        }
                    },
                    {
                        table: 'sys_ui_action_role'
                        id: 'fdd31a158d0146c6bf25b5f380627bf4'
                        key: {
                            sys_ui_action: '87bb71396fcf4877884ee55ed986666a'
                            sys_user_role: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'fee495ca4e5a41d8b82ff031e7233fe3'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'body'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'ffd8013dd2454c9fa6b50b6d4479e7f5'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'table'
                            language: 'en'
                        }
                    },
                ]
            }
        }
    }
}
