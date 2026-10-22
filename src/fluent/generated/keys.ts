import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    'action-add-slide': {
                        table: 'sys_hub_action_type_definition'
                        id: '1f16f9f5fe7b444fbd95a17181657ee0'
                    }
                    'action-add-slide-script': {
                        table: 'sys_hub_step_instance'
                        id: 'ee3fe7cd3d1341e287994272601d6a8c'
                    }
                    'action-create-presentation': {
                        table: 'sys_hub_action_type_definition'
                        id: '9b569d2b22ca438b956dcab89d79f87d'
                    }
                    'action-create-presentation-script': {
                        table: 'sys_hub_step_instance'
                        id: '49109505aed0474889a11ff8d8a8f2ee'
                    }
                    'action-export-link': {
                        table: 'sys_hub_action_type_definition'
                        id: '2938cd7bd49540048c3c0786477e25ed'
                    }
                    'action-export-link-script': {
                        table: 'sys_hub_step_instance'
                        id: 'cd079bfd47ce476d8c4f1aa6c654a529'
                    }
                    bom_json: {
                        table: 'sys_module'
                        id: 'dd4d7a33d2304be4b667d73673eb2ff0'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: 'a4789771491d4aa193ef80de35899499'
                    }
                    'presentation-create': {
                        table: 'sys_security_acl'
                        id: '827c25220cb144b487a88abd22b76f0f'
                    }
                    'presentation-delete': {
                        table: 'sys_security_acl'
                        id: 'de9c06f1e06a42839125d7cf442cb513'
                    }
                    'presentation-delete-own': {
                        table: 'sys_security_acl'
                        id: 'db1e6311b4464a7bab6ce484a64ac228'
                    }
                    'presentation-read': {
                        table: 'sys_security_acl'
                        id: '0fce90efbffa428092b71d76425d9b88'
                    }
                    'presentation-write': {
                        table: 'sys_security_acl'
                        id: '2f5ccc468a4f49d583673220e0cd571a'
                    }
                    'presentation-write-own': {
                        table: 'sys_security_acl'
                        id: 'ebca93010b2e4cf09a8890616ecd16c4'
                    }
                    'src_server_template-versions_ts': {
                        table: 'sys_module'
                        id: '6b913c0983e648fcb593d5ca76f6a023'
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
                        deleted: true
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
                    'template-version-read': {
                        table: 'sys_security_acl'
                        id: '43386929100b48b19795922829a8a927'
                    }
                    'template-versions': {
                        table: 'sys_script'
                        id: 'ecde2baa5de941039f29a5cd14466625'
                    }
                    'template-write': {
                        table: 'sys_security_acl'
                        id: '6ea6936fce374ffbb9c0278a0af6374e'
                    }
                    'templater-api': {
                        table: 'sys_ws_definition'
                        id: 'ffb509f6979646ea8797671d25e745b2'
                    }
                    'templater-api-email': {
                        table: 'sys_ws_operation'
                        id: '46843b70bbc444adbfde5a73879d528b'
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
                    'templater-debug-property': {
                        table: 'sys_properties'
                        id: '4002675151bc49dd92cf119eb8d65412'
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
                    'templater-module-presentation-table': {
                        table: 'sys_app_module'
                        id: 'fc6bea369d8f40a39534fcf4646c68c5'
                    }
                    'templater-module-table': {
                        table: 'sys_app_module'
                        id: '6d6a9aaf238c4a02afedf6f707784753'
                    }
                    'templater-module-templates': {
                        table: 'sys_app_module'
                        id: '03fa1c70d5234d88aff0304e1dc5b91f'
                    }
                    'templater-script-include': {
                        table: 'sys_script_include'
                        id: '28cb670974314006af77679be81068e4'
                    }
                    'templater-utils': {
                        table: 'sys_script_include'
                        id: 'c99dd377d98b4d6c8f404babc3c1189e'
                    }
                }
                composite: [
                    {
                        table: 'sys_security_acl_role'
                        id: '00f2341d72e1418b95d20a4eaa3364c7'
                        key: {
                            sys_security_acl: 'db1e6311b4464a7bab6ce484a64ac228'
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
                        id: '0121ede44a74452b9e2a9df67edc51f8'
                        key: {
                            name: 'var__m_sys_hub_action_input_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'template'
                            language: 'en'
                        }
                    },
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
                        table: 'sys_documentation'
                        id: '03e705a4e39a4b0998f485d16360660e'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_variable_value'
                        id: '070177ea42e4474da0debba040bc6b60'
                        key: {
                            document_key: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            variable: '71aa7f6647032200b4fad7527c9a719b'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '094d52d546f74cdd809b1467f1b9a415'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'body'
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
                        table: 'sys_choice'
                        id: '0a9e04f3a1a44f9ca46079ca4080c1c9'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'kind'
                            value: 'chart'
                            language: 'en'
                            dependent_value: 'NULL'
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
                        table: 'sys_documentation'
                        id: '0dcae07cef354a6d877380e7f856e6d5'
                        key: {
                            name: 'var__m_sys_hub_action_output_2938cd7bd49540048c3c0786477e25ed'
                            element: '__dont_treat_as_error__'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: '0e6573cd86fc43c691656ec29fd5f543'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'title'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '0f794338d642487192a97223d9ed4493'
                        key: {
                            id: 'ee3fe7cd3d1341e287994272601d6a8c'
                            table: 'var__m_sys_hub_step_ext_input_ee3fe7cd3d1341e287994272601d6a8c'
                            field: 'presentation'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: '10b1a09bb7c14ad9bfeb857ff1e162ac'
                        key: {
                            model: 'ee3fe7cd3d1341e287994272601d6a8c'
                            element: 'presentation'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '10d99733cc684408a7a16b4a19ab5f8d'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'version'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '116fba26cec5409682408338ed6c702e'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'table'
                            language: 'en'
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
                        table: 'sys_dictionary'
                        id: '15ba4c16e9ff4b31afd544149fb35a2c'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'query'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '15cee7080a8841fc9a549f8de593abf5'
                        key: {
                            name: 'x_1040823_template/noto-sans-bold-italic'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '165eb860de484ebdabb2415ea95c757a'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'table'
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
                        id: '19abce6b984c418292d5e13314691083'
                        key: {
                            name: 'var__m_sys_hub_action_output_2938cd7bd49540048c3c0786477e25ed'
                            element: 'url'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '1a21495f2151495081aadf9a69b8d47d'
                        key: {
                            name: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'present_url'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '1a2bc184fd024200b2705dcdb4e28557'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                            value: 'title'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '1aa690df6d2b41e9913b576bbe2bae94'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'draft_body'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: '1b7cdd53ffac479f8f5142b58a93949d'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'presentation'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: '1b9b32c9eef547f6b205226d0d32b38e'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'presentation'
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
                        table: 'sys_documentation'
                        id: '1fee92a86b994c97bdcfa07c70797b35'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'NULL'
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
                        table: 'sys_choice'
                        id: '2148fdc981484f9bbf93c5e07998f909'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                            value: 'titleOnly'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '21ec932ad7904f0ba88764d6a8029661'
                        key: {
                            sys_security_acl: 'de9c06f1e06a42839125d7cf442cb513'
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
                        id: '22322da007f1402eb3de8c16d20649d9'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'body'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '22665e5914664c4caf48056e8c79d6b2'
                        key: {
                            id: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            table: 'var__m_sys_hub_step_ext_input_cd079bfd47ce476d8c4f1aa6c654a529'
                            field: 'template'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '22d63f39333948e8baf275108f958672'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'note'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: '23151870f2754e27ab722c043638902c'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'title'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: '2380b2c865b54253849352aea446354c'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: 'absolute'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '23878e40fc044170aab74913d5dbcc66'
                        key: {
                            name: 'var__m_sys_hub_action_input_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'title'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: '24efe142aeee42c7b5888fe0d2d9f4d0'
                        key: {
                            name: 'x_1040823_template_version'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '250db3031357443ca97ca7cf37dc7e5e'
                        key: {
                            id: '49109505aed0474889a11ff8d8a8f2ee'
                            table: 'var__m_sys_hub_step_ext_input_49109505aed0474889a11ff8d8a8f2ee'
                            field: 'limit'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '261933e8fd51491aa64bd8d827854a23'
                        key: {
                            id: 'ee3fe7cd3d1341e287994272601d6a8c'
                            table: 'var__m_sys_hub_step_ext_input_ee3fe7cd3d1341e287994272601d6a8c'
                            field: 'title'
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
                        table: 'sys_documentation'
                        id: '295784aa1ff54a75a2bab1f19f19e3fb'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'query'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: '2a60a3827461423f9e07f4164d05063a'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: '__dont_treat_as_error__'
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
                        table: 'sys_documentation'
                        id: '30f629a7e03747a890080d5b1614bd46'
                        key: {
                            name: 'var__m_sys_hub_action_output_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: '__dont_treat_as_error__'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '30f985ec6c92443d8c270d057a4ba978'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'template'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '3183a8a3fed0421084415fea630a8bfd'
                        key: {
                            name: 'var__m_sys_hub_action_input_2938cd7bd49540048c3c0786477e25ed'
                            element: 'query'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '32346b2f71824bb2b9d381486504b2da'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'title'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '34681ea5aa6140bc89ac158e6d96e433'
                        key: {
                            id: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            table: 'var__m_sys_hub_step_ext_input_cd079bfd47ce476d8c4f1aa6c654a529'
                            field: 'query'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: '37a3044ffde944b8ba5afb6ebfee7d76'
                        key: {
                            sys_security_acl: '827c25220cb144b487a88abd22b76f0f'
                            sys_user_role: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
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
                        table: 'sys_hub_step_ext_output'
                        id: '388d04ae87b24a049af1602259bbc28c'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'present_url'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '393414030fb242b8a412c99d23949033'
                        key: {
                            name: 'x_1040823_template/noto-sans-bold.js.map'
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
                        table: 'sys_hub_step_ext_input'
                        id: '406198d5988a4e0fae4096221ab04fca'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'query'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '414bbfbb9cc947d2bf6af6cf5b07386b'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'template'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: '4470ac12460d44dc9ff34a13d36b17a7'
                        key: {
                            model: 'ee3fe7cd3d1341e287994272601d6a8c'
                            element: 'text'
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
                        table: 'sys_hub_action_input'
                        id: '4551625bfef4427ebffe6e5e1385ee06'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: 'template'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '46d50bc58397487cb4ead43066812b62'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'NULL'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '470b40af26534c5498017377ea1ff6a2'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'template'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '4a72dd43f7f24119a6dcf63d00201ab6'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '4b195766f3ad4ae994d18496aa8abac4'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'has_draft'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '4ce114fce4924a279ecc765fda389a7f'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'text'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '4e5cfb0fa71f4b8e94ab995dc89a4b07'
                        key: {
                            name: 'var__m_sys_hub_action_output_2938cd7bd49540048c3c0786477e25ed'
                            element: '__action_status__'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_variable_value'
                        id: '5035d026c82548258742422925732ff1'
                        key: {
                            document_key: '49109505aed0474889a11ff8d8a8f2ee'
                            variable: '74315b04b3201300176b051a16a8dc2b'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '50456b133adb4667816bfe136c73315d'
                        key: {
                            name: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'build_url'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '510011b32dce4638b743f24033265a4b'
                        key: {
                            name: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            element: '__dont_treat_as_error__'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '5487c07521ba4b598ec3aa619f8d5b28'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'template'
                            language: 'en'
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
                        table: 'sys_documentation'
                        id: '57a12116f2654717a3d617a7fa883af4'
                        key: {
                            name: 'var__m_sys_hub_action_input_2938cd7bd49540048c3c0786477e25ed'
                            element: 'template'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_output'
                        id: '5918b38f0840451b9fa5d7319da76652'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'presentation'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '5a6d01ffc19f49c38def9bba145c7681'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'record_limit'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '5b012aab5be74115a30cb2e1e4845f82'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'order_by'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '5b437622b6e1441a9c8dc168f4288b09'
                        key: {
                            id: '2938cd7bd49540048c3c0786477e25ed'
                            table: 'var__m_sys_hub_action_output_2938cd7bd49540048c3c0786477e25ed'
                            field: 'url'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: '5d2cf7f532f8437e82e8b5f65cc57936'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'build_url'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: '61963ac0603d4967b9b5c1d2f881b1dd'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: '__dont_treat_as_error__'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '61c7be340dca446dbd9b324dccdaded8'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'kind'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '63003553eaf34e9690116744510d22dc'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'NULL'
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
                        table: 'sys_documentation'
                        id: '64abca44315a4cbcae1aedd48b3970d5'
                        key: {
                            name: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            element: '__action_status__'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: '64e5a37d11a04f559ecb348af553262a'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'name'
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
                        id: '668624ab3c254271a3c9f492489bb412'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'note'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: '668b63144e59443eb9c16107ae73cc4e'
                        key: {
                            name: 'x_1040823_template_presentation'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '677169ab18074fefb8a40c75a137143e'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'name'
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
                        table: 'sys_documentation'
                        id: '6af5b27bdd1c4d79be9675733b414854'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '6d25405101d94a929e5fe3896b51349b'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'has_draft'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: '6fb3d5fb658b44fe9966b703c7728204'
                        key: {
                            model: 'ee3fe7cd3d1341e287994272601d6a8c'
                            element: 'title'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '7080b80c12fb4d848e02f4797c7ca976'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'version'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_output'
                        id: '70deffea98e8490b96943d41ddfd5e99'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'build_url'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '75c12bad53684a64bdb220f89523b581'
                        key: {
                            name: 'x_1040823_template/noto-sans-bold'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '7708d5df53f44dfcb02bf0b5eaacbfdf'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'title'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '7788e60a8d164fb09d1b62546154fcc7'
                        key: {
                            id: '49109505aed0474889a11ff8d8a8f2ee'
                            table: 'var__m_sys_hub_step_ext_input_49109505aed0474889a11ff8d8a8f2ee'
                            field: 'title'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: '77b0043215ad4db786661a8d2006583f'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'template'
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
                        table: 'sys_dictionary'
                        id: '788c2e17bf6a4564bdbf0178149b559a'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'body'
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
                        table: 'sys_hub_step_ext_input'
                        id: '78f9be90b72545358ca42744ce955780'
                        key: {
                            model: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            element: 'absolute'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '7a8f00b166a144a8b29801ef20d89c20'
                        key: {
                            id: 'ee3fe7cd3d1341e287994272601d6a8c'
                            table: 'var__m_sys_hub_step_ext_input_ee3fe7cd3d1341e287994272601d6a8c'
                            field: 'notes'
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
                        table: 'sys_hub_step_ext_input'
                        id: '8045a416018e4505a09cf7f1dd450d42'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'name'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: '83390e018e0841608fb337d801450bc9'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: 'url'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_output'
                        id: '83a14ec3e6ed494db2a7b80b416dac25'
                        key: {
                            model: 'ee3fe7cd3d1341e287994272601d6a8c'
                            element: 'present_url'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '840f63ad339345f2b2e8c4f48305fe50'
                        key: {
                            id: '9b569d2b22ca438b956dcab89d79f87d'
                            table: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            field: 'build_url'
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
                        table: 'sys_choice'
                        id: '8593274b9dad40d099d70075020ebece'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                            value: 'section'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '86b5752b82834773a22fd1dd8dac0f01'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'presentation'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: '8c9bba4d5ab74536b756d7d6ef0b0ff5'
                        key: {
                            model: 'ee3fe7cd3d1341e287994272601d6a8c'
                            element: 'layout'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '8e032f83b92549818901a873aca8ff60'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'draft_body'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '8e43ea732fb1470fbeddc24be446ca38'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'version'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_variable_value'
                        id: '8ed85f33bba44770b23c9a1808d84214'
                        key: {
                            document_key: '49109505aed0474889a11ff8d8a8f2ee'
                            variable: '71aa7f6647032200b4fad7527c9a719b'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '9084d9a0d2424236976b632c48c832eb'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'kind'
                            language: 'en'
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
                        table: 'sys_hub_action_input'
                        id: '9297e2111e424523baf39c944387e034'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'notes'
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
                        table: 'sys_variable_value'
                        id: '962166d5d887417aa916c76c6305fdb5'
                        key: {
                            document_key: 'ee3fe7cd3d1341e287994272601d6a8c'
                            variable: '71aa7f6647032200b4fad7527c9a719b'
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
                        table: 'sys_hub_step_ext_input'
                        id: '96a5f1e31ff8474f9be1982ff7d4dce0'
                        key: {
                            model: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            element: 'record'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '970c00f50aac42feb526d5adb95f8ecf'
                        key: {
                            id: '49109505aed0474889a11ff8d8a8f2ee'
                            table: 'var__m_sys_hub_step_ext_input_49109505aed0474889a11ff8d8a8f2ee'
                            field: 'name'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '9a448c125b894fb79ea68a15528cf2a0'
                        key: {
                            name: 'var__m_sys_hub_action_input_2938cd7bd49540048c3c0786477e25ed'
                            element: 'absolute'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: '9a72184668554d64995e26242fee9b91'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: '9ca91c5b61a54bd8be649d65ab1f453b'
                        key: {
                            id: 'ee3fe7cd3d1341e287994272601d6a8c'
                            table: 'var__m_sys_hub_step_ext_input_ee3fe7cd3d1341e287994272601d6a8c'
                            field: 'layout'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '9ed4d0af3ea04d7c97024af050d8dc79'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'name'
                            language: 'en'
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
                        table: 'sys_variable_value'
                        id: 'a0b0c2d598cf417c85f94cbec72a497a'
                        key: {
                            document_key: 'ee3fe7cd3d1341e287994272601d6a8c'
                            variable: '74315b04b3201300176b051a16a8dc2b'
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
                        table: 'sys_element_mapping'
                        id: 'a69f319886194b0d9d1b791a7191a069'
                        key: {
                            id: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            table: 'var__m_sys_hub_step_ext_input_cd079bfd47ce476d8c4f1aa6c654a529'
                            field: 'absolute'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: 'a784f8cccbbc481daf8a9a34b03bc7a7'
                        key: {
                            model: 'ee3fe7cd3d1341e287994272601d6a8c'
                            element: 'notes'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'a8242b7b869a4f9ab2940cea641cfae0'
                        key: {
                            id: '49109505aed0474889a11ff8d8a8f2ee'
                            table: 'var__m_sys_hub_step_ext_input_49109505aed0474889a11ff8d8a8f2ee'
                            field: 'query'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: 'b0fdae3d642245e7bc7a705a2266506d'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: '__action_status__'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'b290567c527d43399255d698d964cf46'
                        key: {
                            name: 'x_1040823_template/noto-sans-italic.js.map'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'b2b00bcc0cc34a2393b3d5627c776cfe'
                        key: {
                            id: 'ee3fe7cd3d1341e287994272601d6a8c'
                            table: 'var__m_sys_hub_step_ext_input_ee3fe7cd3d1341e287994272601d6a8c'
                            field: 'text'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'b3442c5e37ca490489519bf6faa33dc3'
                        key: {
                            name: 'x_1040823_template/noto-sans-italic'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'b48fa7bb106a430f8a5fd4483aa8dd04'
                        key: {
                            name: 'var__m_sys_hub_action_input_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'limit'
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
                        id: 'b57f52ac5b984ac5b6ed23e4cb364055'
                        key: {
                            name: 'var__m_sys_hub_action_output_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'present_url'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_output'
                        id: 'b696fdbe2e53454192815e4d171d44a3'
                        key: {
                            model: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            element: 'url'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: 'b6bd27aca38148ce801ee9ad4897d4bb'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'title'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'b82d1d439ea341e7ad99f471191ef3e4'
                        key: {
                            id: '49109505aed0474889a11ff8d8a8f2ee'
                            table: 'var__m_sys_hub_step_ext_input_49109505aed0474889a11ff8d8a8f2ee'
                            field: 'template'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: 'b91a541f12a14ab197efb5151a43cd4f'
                        key: {
                            sys_security_acl: '43386929100b48b19795922829a8a927'
                            sys_user_role: {
                                id: '37def2dd69894fbcbb65bab042e3de06'
                                key: {
                                    name: 'x_1040823_template.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'ba32093fc88c490baff16e60313de836'
                        key: {
                            id: '9b569d2b22ca438b956dcab89d79f87d'
                            table: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            field: 'presentation'
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
                        table: 'sys_documentation'
                        id: 'baf504cd58de44c5afe13c3b9a10305f'
                        key: {
                            name: 'var__m_sys_hub_action_input_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'bb453a3bbb0749e8ac9b0224d08f34a5'
                        key: {
                            name: 'x_1040823_template/noto-sans-regular'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'bc8ffc6a74434d7d8c5eb7d78a06fdf7'
                        key: {
                            name: 'x_1040823_template/noto-sans-bold-italic.js.map'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'bd37e8003d1548cb9be3a119bb0d20d3'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'version'
                            language: 'en'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: 'bfab0f93f2294d0c8e89911e90d8b7e7'
                        key: {
                            name: 'x_1040823_template_version'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'bfeb6c055e564aa6bfd7c334a2ba3cfd'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'publish_note'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: 'c19f45ef26274c33a933e73f046dfb69'
                        key: {
                            model: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            element: 'template'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'c23253a46fd74248a740aaa8a75a89f2'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'title'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: 'c5049c3dd8524befb583a3b7e4c72f31'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'template'
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
                        table: 'sys_dictionary'
                        id: 'c7d55c0eb99b4e1992aec48bdbb1fb93'
                        key: {
                            name: 'x_1040823_template_template'
                            element: 'publish_note'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'c8a47b29af904e09a794271f66450345'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                            value: 'blank'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_hub_step_ext_input'
                        id: 'ca6792fd349545468bf4c55cec86f238'
                        key: {
                            model: '49109505aed0474889a11ff8d8a8f2ee'
                            element: 'limit'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: 'cce0186e0ce94458a89235d6267a4b2a'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: '__dont_treat_as_error__'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: 'cdc1fc49f81e4704896e90217101385f'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: 'record'
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
                        table: 'sys_documentation'
                        id: 'cff9a31c09c644d789fd268c7e524539'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'body'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: 'd4f5c984248c44d2a1b36172f8f5aa31'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'query'
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
                        id: 'db1490d43e0c443891ea359b8e716827'
                        key: {
                            name: 'var__m_sys_hub_action_output_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: '__action_status__'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'db40bbae9f4b4c74bc082d6d9e0d503e'
                        key: {
                            name: 'x_1040823_template/noto-sans-regular.js.map'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'dc9e3de390264780b60369d9dee4c4cc'
                        key: {
                            id: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            table: 'var__m_sys_hub_step_ext_input_cd079bfd47ce476d8c4f1aa6c654a529'
                            field: 'record'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'dcb5a810d7474b4cacf3d9930ad63d04'
                        key: {
                            name: 'var__m_sys_hub_action_input_2938cd7bd49540048c3c0786477e25ed'
                            element: 'record'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'df06adc4d7864db6b4de1d39798d053d'
                        key: {
                            id: '9b569d2b22ca438b956dcab89d79f87d'
                            table: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            field: 'present_url'
                        }
                    },
                    {
                        table: 'sys_element_mapping'
                        id: 'df3c90f3a54e4e359191693e27355465'
                        key: {
                            id: '1f16f9f5fe7b444fbd95a17181657ee0'
                            table: 'var__m_sys_hub_action_output_1f16f9f5fe7b444fbd95a17181657ee0'
                            field: 'present_url'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e023f45d7457474cb128ce29ca71c5c1'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'notes'
                            language: 'en'
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
                        table: 'sys_variable_value'
                        id: 'e3d1b26aa02b4f3989a36479e7353c46'
                        key: {
                            document_key: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            variable: '74315b04b3201300176b051a16a8dc2b'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: 'e3d7c7e8b11f4e5db5be67dc745e6f12'
                        key: {
                            name: 'x_1040823_template_presentation'
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
                        table: 'sys_hub_step_ext_input'
                        id: 'e493af24fb0d41f8b80ad05864a6ba5a'
                        key: {
                            model: 'cd079bfd47ce476d8c4f1aa6c654a529'
                            element: 'query'
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
                        table: 'sys_hub_action_input'
                        id: 'e65b64d496594a5d939d0469b20889a7'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'text'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: 'e8cc6b9bd0ab49058404428b920d0b9b'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: 'query'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: 'e97ed2de9a4b4a8b8fa698619b04f9e3'
                        key: {
                            model: '2938cd7bd49540048c3c0786477e25ed'
                            element: '__action_status__'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'ea1b9116b12a4b37b5dddaf17c332aa2'
                        key: {
                            name: 'var__m_sys_hub_action_input_1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'layout'
                            value: 'titleContent'
                            language: 'en'
                            dependent_value: 'NULL'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: 'ec025e5ec07642689947a8fc55d8707d'
                        key: {
                            sys_security_acl: 'ebca93010b2e4cf09a8890616ecd16c4'
                            sys_user_role: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: 'ed37158b8a024f03918dfc6ff7637ceb'
                        key: {
                            model: '1f16f9f5fe7b444fbd95a17181657ee0'
                            element: 'present_url'
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
                        table: 'sys_hub_action_output'
                        id: 'f1805fb488554a37923841f9ec326941'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'present_url'
                        }
                    },
                    {
                        table: 'sys_hub_action_output'
                        id: 'f4c6d7010e194fe094ede0100620ee15'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: '__action_status__'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'f670076a53134de3b8b6e37e57919685'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'order_by'
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
                        table: 'sys_dictionary'
                        id: 'f92b9b3e8afa43c39fdf321941862b6f'
                        key: {
                            name: 'x_1040823_template_presentation'
                            element: 'record_limit'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: 'f9c53b4820d94e1aa052d979db90df3b'
                        key: {
                            sys_security_acl: '2f5ccc468a4f49d583673220e0cd571a'
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
                        id: 'fa77302622f441ffb73b4761334d2595'
                        key: {
                            name: 'var__m_sys_hub_action_input_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'query'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_hub_action_input'
                        id: 'fa844169423f43a683623679f6d77a10'
                        key: {
                            model: '9b569d2b22ca438b956dcab89d79f87d'
                            element: 'limit'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'fa8cbee218554a24b24ec0796b6d6828'
                        key: {
                            name: 'var__m_sys_hub_action_output_9b569d2b22ca438b956dcab89d79f87d'
                            element: 'presentation'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_security_acl_role'
                        id: 'fb0fc2ebff4749dbb79fbbfdb26a0546'
                        key: {
                            sys_security_acl: '0fce90efbffa428092b71d76425d9b88'
                            sys_user_role: {
                                id: '7b02ab47838d484c8e20dc95771aca97'
                                key: {
                                    name: 'x_1040823_template.user'
                                }
                            }
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
                    {
                        table: 'sys_dictionary'
                        id: 'ffee93efdf2a4fe08bca6f339c66517c'
                        key: {
                            name: 'x_1040823_template_version'
                            element: 'name'
                        }
                    },
                ]
            }
        }
    }
}
