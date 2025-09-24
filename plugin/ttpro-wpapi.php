<?php
/*
Plugin Name: TT Censo API
Description: Endpoints para TT Censo 2025. CPTs de Rutas y PDVs. Devuelve PDVs del usuario y recibe respuestas (foto como imagen destacada, metadatos y usuario que llenó).
Version: 1.11.0
Author: TT
*/
if (!defined('ABSPATH')) exit;

class TTPro_Api {
  const REST_NAMESPACE = 'myapp/v1';
  const PDV_TABLE_ROUTE = '/pdv-table';
  const PDV_RESET_ROUTE = '/pdv-reset';
  const PDV_TRASH_ROUTE = '/pdv-trash';
  const REST_NONCE_ACTION = 'wp_rest';

  public function __construct() {
    add_action('init', [$this,'register_cpts']);
    add_action('rest_api_init', [$this,'register_routes']);
    add_action('mb_relationships_init', [$this,'register_relationships']);
    add_filter('mb_settings_pages', [$this,'register_settings_pages']);
    add_filter('rwmb_meta_boxes', [$this,'register_settings_fields']);
    add_shortcode('ttpro_pdv_table', [$this,'shortcode_pdv_table']);
  }

  /* ===================== CPTs ===================== */
  public function register_cpts() {
    register_post_type('tt_route', [
      'label'        => 'Rutas',
      /*'public'       => false,
      'show_ui'      => true,*/
      'public'       => true,
      'supports'     => ['title','author','custom-fields','page-attributes'],
      'hierarchical' => true,
      //'rewrite'      => ['slug'=>'tt_route','with_front'=>false,'hierarchical'=>true],
      'show_in_rest' => false,
      'menu_position'=> 25,
    ]);

    register_post_type('tt_pdv', [
      'label'        => 'Puntos de Venta',
      /*'public'       => false,
      'show_ui'      => true,*/
      'public'       => true,
      'supports'     => ['title','author','thumbnail','custom-fields'], // 👈 imagen destacada + custom fields
      'show_in_rest' => false,
      'menu_position'=> 26,
    ]);

    register_post_type('tt_sede', [
      'label'        => 'Sedes',
      /*'public'       => false,
      'show_ui'      => true,*/
      'public'       => true,
      'supports'     => ['title','author','custom-fields'],
      'show_in_rest' => false,
      'menu_position'=> 27,
    ]);

    register_post_type('departamento', [
      'label'        => 'Departamentos',
      /*'public'       => false,
      'show_ui'      => true,*/
      'public'       => true,
      'supports'     => ['title'],
      'show_in_rest' => false,
      'menu_position'=> 28,
    ]);

    register_post_type('municipio', [
      'label'        => 'Municipios',
      /*'public'       => false,
      'show_ui'      => true,*/
      'public'       => true,
      'supports'     => ['title'],
      'show_in_rest' => false,
      'menu_position'=> 29,
    ]);
  }

    public function register_relationships() {

        MB_Relationships_API::register([
            'id' => 'users_to_routes',
            'from' => [
                'object_type' => 'user',
                'field' => [
                    'query_args' => [
                        'role' => 'author',
                    ],
                ],
                'meta_box' => [
                    'title' => 'Rutas',
                    'include' => [
                        'edited_user_role' => 'author',
                    ],
                ],
            ],
            'to' => [
                'object_type' => 'post',
                'post_type' => 'tt_route',
                'field' => [
                    'query_args' => [
                        'post_parent' => 0,
                    ],
                ],
                'meta_box' => [
                    'title' => 'Vendedores',
                    'include' => [
                        'is_child' => false,
                    ],
                ],
            ],
        ]);

        MB_Relationships_API::register([
            'id' => 'supervisores_to_routes',
            'from' => [
                'object_type' => 'user',
                'field' => [
                    'query_args' => [
                        'role' => 'editor',
                    ],
                ],
                'meta_box' => [
                    'title' => 'Rutas',
                    'include' => [
                        'edited_user_role' => 'editor',
                    ],
                ],
            ],
            'to' => [
                'object_type' => 'post',
                'post_type' => 'tt_route',
                'field' => [
                    'query_args' => [
                        'post_parent' => 0,
                    ],
                ],
                'meta_box' => [
                    'title' => 'Supervisores',
                    'include' => [
                        'is_child' => false,
                    ],
                ],
            ],
        ]);

        MB_Relationships_API::register([
            'id' => 'supervisores_to_sedes',
            'from' => [
                'object_type' => 'user',
                'field' => [
                    'query_args' => [
                        'role' => 'editor',
                    ],
                ],
                'meta_box' => [
                    'title' => 'Sedes',
                    'include' => [
                        'edited_user_role' => 'editor',
                    ],
                ],
            ],
            'to' => [
                'object_type' => 'post',
                'post_type' => 'tt_sede',
                'meta_box' => [
                    'title' => 'Supervisores',
                ],
            ],
        ]);

        MB_Relationships_API::register([
            'id' => 'routes_to_pdvs',
            'from' => [
                'object_type' => 'post',
                'post_type' => 'tt_route',
                'field' => [
                    'query_args' => [
                        'post_parent__not_in' => [0],
                    ],
                ],
                'meta_box' => [
                    'title' => 'Puntos de venta',
                    'include' => [
                        'is_child' => true,
                    ],
                ],
            ],
            'to' => [
                'object_type' => 'post',
                'post_type' => 'tt_pdv',
                'meta_box' => [
                    'title' => 'Día de visita',
                ],
            ],
        ]);

        MB_Relationships_API::register([
            'id' => 'municipios_to_departamentos',
            'from' => [
                'object_type' => 'post',
                'post_type' => 'municipio',
                'meta_box' => [
                    'title' => 'Departamentos',
                ],
                'admin_column' => true,
            ],
            'to' => [
                'object_type' => 'post',
                'post_type' => 'departamento',
                'meta_box' => [
                    'title' => 'Municipios',
                ],
                'admin_column' => true,
            ],
        ]);

    }

  public function register_settings_pages( $settings_pages ) {
    $settings_pages[] = [
      'id'          => 'ttpro_catalogs',
      'option_name' => 'ttpro_catalogs',
      'menu_title'  => 'TT Pro Catálogos',
      'parent'      => 'options-general.php',
      'columns' => 1,
    ];
    return $settings_pages;
  }

  public function register_settings_fields( $meta_boxes ) {
    $meta_boxes[] = [
      'id'             => 'ttpro_catalogs_fields',
      'title'          => 'Preguntas del formulario',
      'settings_pages' => 'ttpro_catalogs',
      'fields'         => [
        [
          'id'         => 'questions',
          'type'       => 'group',
          'clone'      => true,
          'sort_clone' => true,
          'add_button' => 'Agregar pregunta',
          'fields'     => [
            [
              'id'   => 'qid',
              'name' => 'ID',
              'type' => 'text',
            ],
            [
              'id'   => 'qlabel',
              'name' => 'Etiqueta',
              'type' => 'text',
            ],
            [
              'id'      => 'qtype',
              'name'    => 'Tipo',
              'type'    => 'select',
              'options' => [
                'text'     => 'Text',
                'textarea' => 'Textarea',
                'radio'    => 'Radio',
                'number'   => 'Number',
                'photo'    => 'Photo',
                'geo'      => 'Geo',
                'post'     => 'Post',
              ],
              'std'     => 'text',
            ],
            [
              'id'         => 'post_type',
              'name'       => 'Tipo de post',
              'type'       => 'text',
              'desc'       => 'Slug del post type que se usará para generar las opciones.',
              'attributes' => [ 'placeholder' => 'Ej: tt_route' ],
              'visible'    => [ 'qtype', 'post' ],
            ],
            [
              'id'   => 'required',
              'name' => 'Requerido',
              'type' => 'checkbox',
            ],
            [
              'id'   => 'instruction_image',
              'name' => 'Imagen de instrucciones',
              'type' => 'image_advanced',
              'max_file_uploads' => 1,
              'max_status'       => false,
              'image_size'       => 'medium',
              'desc'             => 'Se mostrará antes de la pregunta en la PWA.',
            ],
            [
              'id'         => 'options',
              'name'       => 'Opciones',
              'type'       => 'group',
              'clone'      => true,
              'add_button' => 'Agregar opción',
              'fields'     => [
                [
                  'id'   => 'opt_value',
                  'name' => 'Valor',
                  'type' => 'text',
                ],
                [
                  'id'   => 'opt_label',
                  'name' => 'Etiqueta',
                  'type' => 'text',
                ],
              ],
              'visible' => [ 'qtype', 'radio' ],
            ],
            [
              'id'         => 'show_if',
              'name'       => 'Mostrar si',
              'type'       => 'group',
              'clone'      => true,
              'add_button' => 'Agregar condición',
              'fields'     => [
                [
                  'id'   => 'cond_id',
                  'name' => 'ID',
                  'type' => 'text',
                ],
                [
                  'id'   => 'cond_value',
                  'name' => 'Valor',
                  'type' => 'text',
                ],
              ],
            ],
          ],
        ],
      ],
    ];
    return $meta_boxes;
  }

  /* ===================== Helpers ===================== */
  private function build_catalog_questions() {
    $questions = rwmb_meta('questions', ['object_type' => 'setting'], 'ttpro_catalogs');
    if (!is_array($questions)) {
      $questions = [];
    }

    $fields = [];
    foreach ($questions as $q) {
      $raw_id = isset($q['qid']) ? $q['qid'] : '';
      if (is_array($raw_id)) {
        $raw_id = reset($raw_id);
      }
      $raw_id = is_scalar($raw_id) ? trim((string) $raw_id) : '';
      if ($raw_id === '') {
        continue;
      }

      $meta_key = sanitize_key($raw_id);
      if ($meta_key === '') {
        continue;
      }

      $field = [
        'id'       => $raw_id,
        'meta_key' => $meta_key,
        'label'    => isset($q['qlabel']) && $q['qlabel'] !== '' ? $q['qlabel'] : $raw_id,
        'type'     => isset($q['qtype']) && $q['qtype'] !== '' ? $q['qtype'] : 'text',
        'required' => !empty($q['required']),
      ];

      if ($field['type'] === 'post') {
        $post_type = isset($q['post_type']) ? sanitize_key($q['post_type']) : '';
        $field['post_type'] = $post_type;

        $options = [];
        if ($post_type) {
          $query_args = [
            'post_type'   => $post_type,
            'post_status' => 'publish',
            'numberposts' => -1,
            'orderby'     => 'title',
            'order'       => 'ASC',
          ];

          $query_args = apply_filters('ttpro_question_post_query_args', $query_args, $post_type, $field['id']);

          $posts = get_posts($query_args);
          foreach ($posts as $post_item) {
            $options[] = [
              'value' => (string) $post_item->ID,
              'label' => get_the_title($post_item),
            ];
          }
        }

        $options = apply_filters('ttpro_question_post_options', $options, $post_type, $field['id']);
        if (!is_array($options)) {
          $options = [];
        }

        $field['options'] = array_values(array_filter($options, function ($opt) {
          return isset($opt['value'], $opt['label']);
        }));
      } elseif (!empty($q['options']) && is_array($q['options'])) {
        $field['options'] = array_map(function ($opt) {
          return [
            'value' => isset($opt['opt_value']) ? $opt['opt_value'] : '',
            'label' => isset($opt['opt_label']) ? $opt['opt_label'] : '',
          ];
        }, $q['options']);
      }

      if (!empty($q['show_if']) && is_array($q['show_if'])) {
        $conds = array_map(function ($cond) {
          $id_raw = isset($cond['cond_id']) ? $cond['cond_id'] : '';
          $value_raw = isset($cond['cond_value']) ? $cond['cond_value'] : '';

          $id = is_scalar($id_raw) ? trim((string) $id_raw) : '';

          if (is_array($value_raw)) {
            $value = array_map(function ($v) {
              return is_scalar($v) ? trim((string) $v) : '';
            }, $value_raw);
            $value = array_values(array_filter($value, function ($v) {
              return $v !== '';
            }));
          } else {
            $value = is_scalar($value_raw) ? trim((string) $value_raw) : '';
            if (strpos($value, '|') !== false || strpos($value, ',') !== false) {
              $parts = preg_split('/[|,]+/', $value);
              $value = array_values(array_filter(array_map(function ($part) {
                return trim((string) $part);
              }, $parts), function ($v) {
                return $v !== '';
              }));
            }
          }

          return [
            'id'    => $id,
            'value' => $value,
          ];
        }, $q['show_if']);

        $conds = array_values(array_filter($conds, function ($cond) {
          return !empty($cond['id']);
        }));

        if (count($conds) === 1) {
          $field['show_if'] = $conds[0];
        } elseif (count($conds) > 1) {
          $field['show_if'] = $conds;
        }
      }

      if (!empty($q['instruction_image'])) {
        $image_data = $q['instruction_image'];
        $image_url = '';

        if (is_array($image_data)) {
          $first = reset($image_data);

          if (is_array($first)) {
            if (!empty($first['url'])) {
              $image_url = $first['url'];
            } elseif (!empty($first['full_url'])) {
              $image_url = $first['full_url'];
            } elseif (!empty($first['ID'])) {
              $image_url = wp_get_attachment_url((int) $first['ID']);
            }
          } elseif (is_scalar($first)) {
            $image_url = wp_get_attachment_url((int) $first);
          }
        } elseif (is_scalar($image_data)) {
          $image_url = (string) $image_data;
        }

        $image_url = is_string($image_url) ? esc_url_raw($image_url) : '';

        if ($image_url) {
          $field['instruction_image'] = $image_url;
        }
      }

      $fields[] = $field;
    }

    return $fields;
  }

  private function current_user_id_jwt() {
    return get_current_user_id(); // sesión normal o JWT
  }

  private function route_assigned_to_user($route_id, $user_id) {
    $assigned = (int) get_post_meta($route_id, 'tt_route_user', true);
    return $assigned === (int)$user_id;
  }

  private function pdv_payload($pdv_id, $s_id) {
    //$sub_id      = (int) get_post_meta($pdv_id, 'tt_pdv_route', true); // ahora sub-ruta
    $sub_id = $s_id;
    $status      = (string) get_post_meta($pdv_id, 'tt_pdv_status', true);
    //$code        = (string) get_post_meta($pdv_id, 'tt_pdv_code', true);
    $code        = (string) get_post_meta($pdv_id, 'codigo', true);
    //$address     = (string) get_post_meta($pdv_id, 'tt_pdv_address', true);
    $address     = (string) get_post_meta($pdv_id, 'direccion', true);
    $sub_title   = $sub_id ? get_the_title($sub_id) : '';
    $route_id    = $sub_id ? (int) wp_get_post_parent_id($sub_id) : 0;
    $route_title = $route_id ? get_the_title($route_id) : '';
    return [
      'id'      => (string) $pdv_id,
      'code'    => $code ?: '',
      'name'    => get_the_title($pdv_id),
      'address' => $address ?: '',
      'status'  => $status ?: 'pending', // pending | filled | synced
      'route'   => [ 'id' => (string)$route_id, 'title' => $route_title ],
      'subroute'=> [ 'id' => (string)$sub_id,   'title' => $sub_title   ],
    ];
  }

  private function find_user_from_request($req) {
    $uid  = isset($req['user_id']) ? intval($req['user_id']) : 0;
    $ulog = isset($req['user_login']) ? sanitize_user($req['user_login']) : '';
    if ($uid > 0) { $u = get_user_by('id', $uid); if ($u) return $u; }
    if ($ulog)  { $u = get_user_by('login', $ulog); if ($u) return $u; }
    return null;
  }

  /** Crea un attachment desde data URL (base64) y lo asigna como thumbnail al PDV */
  private function set_thumbnail_from_base64($pdv_id, $dataUrl) {
    if (empty($dataUrl) || strpos($dataUrl, 'data:image/') !== 0) return false;
    @list($meta, $content) = explode(',', $dataUrl, 2);
    if (!$content) return false;

    // Detecta extensión por mime
    $ext = 'jpg';
    if (strpos($meta, 'image/png') !== false) $ext = 'png';
    if (strpos($meta, 'image/webp') !== false) $ext = 'webp';

    $bytes = base64_decode($content);
    if ($bytes === false) return false;

    $filename = 'pdv_'.$pdv_id.'_'.time().'.'.$ext;

    // Sube el archivo al uploads dir
    $upload = wp_upload_bits($filename, null, $bytes);
    if ($upload['error']) return false;

    // Crea attachment
    $filetype = wp_check_filetype($upload['file'], null);
    $attachment = [
      'post_mime_type' => $filetype['type'],
      'post_title'     => sanitize_file_name($filename),
      'post_content'   => '',
      'post_status'    => 'inherit'
    ];
    $attach_id = wp_insert_attachment($attachment, $upload['file'], $pdv_id);
    if (is_wp_error($attach_id) || !$attach_id) return false;

    // Genera metadata e imagenes (thumbnails)
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
    wp_update_attachment_metadata($attach_id, $attach_data);

    set_post_thumbnail($pdv_id, $attach_id);
    return $attach_id;
  }

  private function get_catalog_questions_indexed() {
    $indexed = [];
    foreach ($this->build_catalog_questions() as $field) {
      $indexed[$field['id']] = $field;
    }
    return $indexed;
  }

  private function normalize_answer_value_for_meta($value, $question) {
    $type = isset($question['type']) ? $question['type'] : '';

    if ($type === 'number') {
      if (is_array($value)) {
        $value = reset($value);
      }
      if (is_scalar($value)) {
        $filtered = preg_replace('/[^0-9\.-]/', '', (string) $value);
        if ($filtered === '' || $filtered === '-' || $filtered === '.' || $filtered === '-.') {
          return '';
        }
        return 0 + $filtered;
      }
      return '';
    }

    if ($type === 'post') {
      $ids = [];
      if (is_array($value)) {
        $ids = $value;
      } elseif ($value !== null && $value !== '') {
        $ids = [$value];
      }

      $labels = [];
      foreach ($ids as $id_val) {
        if (is_scalar($id_val)) {
          $maybe_id = intval($id_val);
          if ($maybe_id > 0) {
            $title = get_the_title($maybe_id);
            if ($title) {
              $labels[] = $title;
              continue;
            }
          }
          $labels[] = trim((string) $id_val);
        }
      }

      $labels = array_values(array_filter($labels, function ($label) {
        return $label !== '';
      }));

      if (!empty($labels)) {
        return implode(', ', array_unique($labels));
      }

      if (is_scalar($value)) {
        return trim((string) $value);
      }

      return '';
    }

    if ($type === 'photo') {
      if (is_array($value)) {
        $has = array_filter($value, function ($item) {
          return !empty($item);
        });
        return !empty($has) ? '1' : '0';
      }
      if (is_scalar($value)) {
        return trim((string) $value) !== '' ? '1' : '0';
      }
      return $value ? '1' : '0';
    }

    if ($type === 'geo') {
      if (is_array($value)) {
        $lat = isset($value['lat']) && is_scalar($value['lat']) ? trim((string) $value['lat']) : '';
        $lng = isset($value['lng']) && is_scalar($value['lng']) ? trim((string) $value['lng']) : '';
        $parts = array_values(array_filter([$lat, $lng], function ($part) {
          return $part !== '';
        }));
        if (!empty($parts)) {
          return implode(', ', $parts);
        }
      }
      if (is_scalar($value)) {
        return trim((string) $value);
      }
      return '';
    }

    if (is_array($value)) {
      $flat = array_map(function ($item) {
        return is_scalar($item) ? trim((string) $item) : '';
      }, $value);
      $flat = array_values(array_filter($flat, function ($item) {
        return $item !== '';
      }));
      return implode(', ', $flat);
    }

    if (is_scalar($value)) {
      return trim((string) $value);
    }

    return '';
  }

  private function format_answer_display_value($value, $question) {
    $type = isset($question['type']) ? $question['type'] : '';

    if ($type === 'photo') {
      if ($value === '' || $value === null) {
        return '';
      }
      $yes_values = ['1', 1, true, 'yes', 'si', 'sí'];
      return in_array($value, $yes_values, true) ? 'Sí' : 'No';
    }

    if (is_array($value)) {
      return implode(', ', array_map('strval', $value));
    }

    if ($value === null) {
      return '';
    }

    return (string) $value;
  }

  private function sync_pdv_answers_meta($pdv_id, $answers) {
    if (!is_array($answers)) {
      return;
    }

    $questions = $this->get_catalog_questions_indexed();

    foreach ($answers as $qid => $value) {
      $id = is_scalar($qid) ? (string) $qid : '';
      if ($id === '') {
        continue;
      }

      $question = isset($questions[$id]) ? $questions[$id] : ['type' => 'text', 'meta_key' => sanitize_key($id)];
      $meta_slug = !empty($question['meta_key']) ? $question['meta_key'] : sanitize_key($id);
      if ($meta_slug === '') {
        continue;
      }

      $normalized = $this->normalize_answer_value_for_meta($value, $question);
      if (is_array($normalized)) {
        $normalized = implode(', ', array_map('strval', $normalized));
      }

      if ($normalized === null) {
        $normalized = '';
      }

      update_post_meta($pdv_id, 'tt_answer_' . $meta_slug, $normalized);
    }
  }

  private function get_pdv_route_labels($pdv_id) {
    $route_title = '';
    $subroute_title = '';

    if (class_exists('MB_Relationships_API')) {
      $connected = MB_Relationships_API::get_connected([
        'id' => 'routes_to_pdvs',
        'to' => $pdv_id,
      ]);

      if (!empty($connected)) {
        $first = $connected[0];
        if ($first instanceof WP_Post) {
          $subroute_title = get_the_title($first);
          $parent_id = (int) wp_get_post_parent_id($first->ID);
          if ($parent_id) {
            $route_title = get_the_title($parent_id);
          } else {
            $route_title = $subroute_title;
            $subroute_title = '';
          }
        }
      }
    }

    return [
      'route'    => $route_title,
      'subroute' => $subroute_title,
    ];
  }

  private function user_can_manage_pdv_rejection() {
    return current_user_can('editor') || current_user_can('administrator');
  }

  private function get_pdv_table_schema() {
    $questions = $this->build_catalog_questions();

    $columns = [];
    $map_index = [];
    $map_data = [];
    $searchable_indexes = [];
    $i = 0;

    $add_column = function ($data, $title, $settings = []) use (&$columns, &$map_index, &$map_data, &$searchable_indexes, &$i) {
      $defaults = [
        'orderable' => true,
        'searchable' => false,
        'className' => '',
        'source' => 'meta',
        'meta_key' => null,
        'meta_type' => 'CHAR',
        'orderby' => null,
      ];
      $settings = array_merge($defaults, $settings);

      $columns[] = [
        'data'       => $data,
        'title'      => $title,
        'orderable'  => (bool) $settings['orderable'],
        'searchable' => (bool) $settings['searchable'],
        'className'  => $settings['className'],
      ];

      $map_index[$i] = [
        'data'       => $data,
        'source'     => $settings['source'],
        'meta_key'   => $settings['meta_key'],
        'meta_type'  => $settings['meta_type'],
        'searchable' => (bool) $settings['searchable'],
        'orderable'  => (bool) $settings['orderable'],
        'orderby'    => $settings['orderby'],
      ];
      $map_data[$data] = $map_index[$i];

      if (!empty($settings['searchable'])) {
        $searchable_indexes[] = $i;
      }

      $i++;
    };

    $add_column('pdv_id', 'ID', [
      'orderable' => true,
      'searchable' => false,
      'className' => 'dt-body-right',
      'source' => 'post',
      'orderby' => 'ID',
    ]);

    $add_column('pdv_title', 'Punto de venta', [
      'orderable' => true,
      'searchable' => false,
      'source' => 'post',
      'orderby' => 'title',
    ]);

    $add_column('pdv_code', 'Código', [
      'orderable' => true,
      'searchable' => true,
      'source' => 'meta',
      'meta_key' => 'codigo',
    ]);

    $add_column('pdv_status', 'Estado', [
      'orderable' => true,
      'searchable' => true,
      'source' => 'meta',
      'meta_key' => 'tt_pdv_status',
    ]);

    $add_column('pdv_route', 'Ruta', [
      'orderable' => false,
      'searchable' => false,
      'source' => 'computed',
    ]);

    $add_column('pdv_subroute', 'Subruta', [
      'orderable' => false,
      'searchable' => false,
      'source' => 'computed',
    ]);

    $add_column('filled_by', 'Actualizado por', [
      'orderable' => true,
      'searchable' => true,
      'source' => 'meta',
      'meta_key' => 'tt_pdv_filled_by_name',
    ]);

    $add_column('filled_at', 'Actualizado el', [
      'orderable' => true,
      'searchable' => true,
      'source' => 'meta',
      'meta_key' => 'tt_pdv_filled_at',
      'meta_type' => 'DATETIME',
    ]);

    if ($this->user_can_manage_pdv_rejection()) {
      $add_column('pdv_reject', 'Rechazar', [
        'orderable' => false,
        'searchable' => false,
        'className' => 'dt-body-center ttpro-pdv-reject-column',
        'source' => 'computed',
      ]);

      $add_column('pdv_delete', 'Eliminar', [
        'orderable' => false,
        'searchable' => false,
        'className' => 'dt-body-center ttpro-pdv-delete-column',
        'source' => 'computed',
      ]);
    }

    foreach ($questions as $question) {
      if (empty($question['meta_key'])) {
        continue;
      }
      $meta_key = 'tt_answer_' . $question['meta_key'];
      $meta_type = (isset($question['type']) && $question['type'] === 'number') ? 'NUMERIC' : 'CHAR';
      $title = isset($question['label']) && $question['label'] !== '' ? $question['label'] : $question['id'];

      $add_column('ans_' . $question['meta_key'], $title, [
        'orderable' => true,
        'searchable' => true,
        'source' => 'meta',
        'meta_key' => $meta_key,
        'meta_type' => $meta_type,
      ]);
    }

    return [
      'columns' => $columns,
      'map_index' => $map_index,
      'map_data' => $map_data,
      'searchable_indexes' => $searchable_indexes,
      'questions' => $questions,
    ];
  }

  private function normalize_numeric_value($val) {
    if (is_array($val)) {
      $out = [];
      foreach ($val as $item) {
        $n = preg_replace('/[^0-9\.-]/', '', (string) $item);
        if ($n === '' || $n === '-' || $n === '.' || $n === '-.') {
          continue;
        }
        $out[] = 0 + $n;
      }
      return $out;
    }

    $n = preg_replace('/[^0-9\.-]/', '', (string) $val);
    if ($n === '' || $n === '-' || $n === '.' || $n === '-.') {
      return null;
    }
    return 0 + $n;
  }

  private function sb_to_meta_query($node, $map_by_data) {
    if (isset($node['criteria']) && is_array($node['criteria'])) {
      $relation = (!empty($node['logic']) && strtoupper($node['logic']) === 'OR') ? 'OR' : 'AND';
      $parts = ['relation' => $relation];
      foreach ($node['criteria'] as $child) {
        if (isset($child['criteria']) && is_array($child['criteria'])) {
          $sub = $this->sb_to_meta_query($child, $map_by_data);
          if ($sub) {
            $parts[] = $sub;
          }
        } else {
          $leaf = $this->sb_criterion_to_clause($child, $map_by_data);
          if ($leaf) {
            $parts[] = $leaf;
          }
        }
      }
      return count($parts) > 1 ? $parts : null;
    }

    return $this->sb_criterion_to_clause($node, $map_by_data);
  }

  private function sb_criterion_to_clause($criterion, $map_by_data) {
    $data_key = '';
    if (!empty($criterion['origData'])) {
      $data_key = $criterion['origData'];
    } elseif (!empty($criterion['data'])) {
      $data_key = $criterion['data'];
    }

    $data_key = is_string($data_key) ? $data_key : '';
    if ($data_key === '' || !isset($map_by_data[$data_key])) {
      return null;
    }

    $column = $map_by_data[$data_key];
    if (empty($column['searchable']) || $column['source'] !== 'meta' || empty($column['meta_key'])) {
      return null;
    }

    $meta_key = $column['meta_key'];
    $meta_type = isset($column['meta_type']) ? $column['meta_type'] : 'CHAR';

    $value = null;
    if (array_key_exists('value', $criterion)) {
      $value = $criterion['value'];
    } elseif (array_key_exists('value1', $criterion) || array_key_exists('value2', $criterion)) {
      $value = [];
      if (array_key_exists('value1', $criterion)) $value[] = $criterion['value1'];
      if (array_key_exists('value2', $criterion)) $value[] = $criterion['value2'];
    }

    if (is_array($value) && count($value) === 1) {
      $value = reset($value);
    }

    if (is_string($value)) {
      $value = trim(wp_unslash($value));
    }

    if ($meta_type === 'NUMERIC' && $value !== null) {
      $value = $this->normalize_numeric_value($value);
      if ($value === null || (is_array($value) && empty($value))) {
        return null;
      }
    }

    $condition = isset($criterion['condition']) ? strtolower((string) $criterion['condition']) : '';

    switch ($condition) {
      case '=':
      case 'equals':
        if (is_array($value)) {
          $value = reset($value);
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => '='];
      case '!=':
      case 'not':
        if (is_array($value)) {
          $value = reset($value);
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => '!='];
      case 'contains':
        if (is_array($value)) {
          $value = reset($value);
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => 'LIKE'];
      case '!contains':
        if (is_array($value)) {
          $value = reset($value);
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => 'NOT LIKE'];
      case 'starts':
      case 'ends':
        if (is_array($value)) {
          $value = reset($value);
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => 'LIKE'];
      case 'null':
        return ['key' => $meta_key, 'compare' => 'NOT EXISTS'];
      case '!null':
      case 'notnull':
        return ['key' => $meta_key, 'compare' => 'EXISTS'];
      case '>':
      case 'gt':
        if (is_array($value)) $value = reset($value);
        return ['key' => $meta_key, 'value' => $value, 'type' => $meta_type, 'compare' => '>'];
      case '>=':
      case 'gte':
        if (is_array($value)) $value = reset($value);
        return ['key' => $meta_key, 'value' => $value, 'type' => $meta_type, 'compare' => '>='];
      case '<':
      case 'lt':
        if (is_array($value)) $value = reset($value);
        return ['key' => $meta_key, 'value' => $value, 'type' => $meta_type, 'compare' => '<'];
      case '<=':
      case 'lte':
        if (is_array($value)) $value = reset($value);
        return ['key' => $meta_key, 'value' => $value, 'type' => $meta_type, 'compare' => '<='];
      case 'between':
      case 'datebetween':
        if (is_array($value) && count($value) >= 2) {
          $values = array_values($value);
          return [
            'relation' => 'AND',
            ['key' => $meta_key, 'value' => $values[0], 'compare' => '>=', 'type' => $meta_type],
            ['key' => $meta_key, 'value' => $values[1], 'compare' => '<=', 'type' => $meta_type],
          ];
        }
        return null;
      case 'in':
        if (is_array($value)) {
          $or = ['relation' => 'OR'];
          foreach ($value as $item) {
            $or[] = ['key' => $meta_key, 'value' => $item, 'compare' => '=', 'type' => $meta_type];
          }
          return $or;
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => '=', 'type' => $meta_type];
      case '!in':
        if (is_array($value)) {
          $and = ['relation' => 'AND'];
          foreach ($value as $item) {
            $and[] = ['key' => $meta_key, 'value' => $item, 'compare' => '!=', 'type' => $meta_type];
          }
          return $and;
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => '!=', 'type' => $meta_type];
      case 'date':
        if (is_array($value)) {
          $value = reset($value);
        }
        return ['key' => $meta_key, 'value' => $value, 'compare' => '=', 'type' => $meta_type];
    }

    return null;
  }

  private function format_pdv_table_row($post_id, $schema) {
    $row = [
      'pdv_id'      => (int) $post_id,
      'pdv_title'   => get_the_title($post_id),
      'pdv_code'    => (string) get_post_meta($post_id, 'codigo', true),
      'pdv_status'  => (string) get_post_meta($post_id, 'tt_pdv_status', true),
      'filled_by'   => (string) get_post_meta($post_id, 'tt_pdv_filled_by_name', true),
      'filled_at'   => (string) get_post_meta($post_id, 'tt_pdv_filled_at', true),
      'pdv_route'   => '',
      'pdv_subroute'=> '',
      'pdv_reject'  => '',
      'pdv_delete'  => '',
    ];

    if ($this->user_can_manage_pdv_rejection()) {
      $row['pdv_reject'] = sprintf(
        '<button type="button" class="btn btn-sm btn-outline-danger ttpro-pdv-reject-btn" data-pdv-id="%d">Rechazar</button>',
        (int) $post_id
      );

      $row['pdv_delete'] = sprintf(
        '<button type="button" class="btn btn-sm btn-outline-danger ttpro-pdv-delete-btn" data-pdv-id="%d">Eliminar</button>',
        (int) $post_id
      );
    }

    if ($row['pdv_status'] === '') {
      $row['pdv_status'] = 'pending';
    }

    $route_labels = $this->get_pdv_route_labels($post_id);
    $row['pdv_route'] = $route_labels['route'];
    $row['pdv_subroute'] = $route_labels['subroute'];

    if ($row['filled_by'] === '') {
      $filled_by_id = get_post_meta($post_id, 'tt_pdv_filled_by', true);
      $user = $filled_by_id ? get_userdata($filled_by_id) : null;
      if ($user) {
        $row['filled_by'] = $user->display_name;
        update_post_meta($post_id, 'tt_pdv_filled_by_name', $row['filled_by']);
      }
    }

    $questions = isset($schema['questions']) ? $schema['questions'] : [];
    $answers_cache = null;

    foreach ($questions as $question) {
      if (empty($question['meta_key'])) {
        continue;
      }

      $meta_key = 'tt_answer_' . $question['meta_key'];
      $value = get_post_meta($post_id, $meta_key, true);

      if ($value === '' || $value === null) {
        if ($answers_cache === null) {
          $raw_answers = get_post_meta($post_id, 'tt_pdv_answers', true);
          $decoded = json_decode($raw_answers, true);
          $answers_cache = is_array($decoded) ? $decoded : [];
        }

        if (isset($answers_cache[$question['id']])) {
          $value = $this->normalize_answer_value_for_meta($answers_cache[$question['id']], $question);
          update_post_meta($post_id, $meta_key, $value);
        }
      }

      $row['ans_' . $question['meta_key']] = $this->format_answer_display_value($value, $question);
    }

    return $row;
  }

  /* ===================== REST ===================== */
  public function register_routes() {

    // Diagnóstico
    register_rest_route('myapp/v1', '/ping', [
      'methods'  => 'GET',
      'permission_callback' => '__return_true',
      'callback' => function() { return ['ok'=>true,'plugin'=>'ttpro-wpapi','version'=>'1.11.0']; }
    ]);

    // Catálogos (protegido)
    register_rest_route(self::REST_NAMESPACE, '/catalogs', [
      'methods'  => 'GET',
      'permission_callback' => function() { return current_user_can('read'); },
      //'permission_callback' => '__return_true',
      'callback' => function($req) {
        return [
          'version' => 3,
          'fields'  => $this->build_catalog_questions(),
        ];
      }
    ]);

    register_rest_route(self::REST_NAMESPACE, self::PDV_TABLE_ROUTE, [
      'methods'  => ['GET','POST'],
      'permission_callback' => function() { return current_user_can('read'); },
      'callback' => [$this, 'rest_pdv_table'],
    ]);

    register_rest_route(self::REST_NAMESPACE, self::PDV_RESET_ROUTE, [
      'methods'  => ['POST'],
      'permission_callback' => function() {
        return $this->user_can_manage_pdv_rejection();
      },
      'callback' => [$this, 'rest_reset_pdv'],
    ]);

    register_rest_route(self::REST_NAMESPACE, self::PDV_TRASH_ROUTE, [
      'methods'  => ['POST'],
      'permission_callback' => function() {
        return $this->user_can_manage_pdv_rejection();
      },
      'callback' => [$this, 'rest_trash_pdv'],
    ]);

    // Rutas + sub-rutas + PDVs del usuario autenticado
    foreach (['/pdvs_all','/pdvs-all'] as $route_path) {
      register_rest_route('myapp/v1', $route_path, [
        'methods'  => 'GET',
        'permission_callback' => function() { return current_user_can('read'); },
        'callback' => function($req) {
          $user_id = $this->current_user_id_jwt();
          if (!$user_id) return new WP_Error('tt_no_user','No autenticado', ['status'=>401]);

          // Rutas principales asignadas al usuario
          /*$routes = get_posts([
            'post_type'   => 'tt_route',
            'numberposts' => -1,
            'post_status' => 'any',
            'post_parent' => 0,
            'meta_query'  => [[ 'key'=>'tt_route_user','value'=>$user_id,'compare'=>'=' ]],
          ]);*/

          if(current_user_can('editor')){
              //supervisor
              $routes = MB_Relationships_API::get_connected([
                  'id' => 'supervisores_to_routes',
                  'from' => $user_id,
              ]);
          } elseif(current_user_can('author')){
              //vendedor
              $routes = MB_Relationships_API::get_connected([
                  'id' => 'users_to_routes',
                  'from' => $user_id,
              ]);
          }

          /*$routes = MB_Relationships_API::get_connected([
              'id' => 'users_to_routes',
              'from' => $user_id,
          ]);*/
          if (!$routes) return [];

          $out = [];
          foreach ($routes as $r) {
            $route_node = [
              'id'        => (string) $r->ID,
              'title'     => get_the_title($r),
              'subroutes' => [],
            ];

            $subs = get_posts([
              'post_type'   => 'tt_route',
              'numberposts' => -1,
              'post_status' => 'publish',
              'post_parent' => $r->ID,
            ]);

            foreach ($subs as $s) {
              /*$pdvs = get_posts([
                'post_type'  => 'tt_pdv',
                'numberposts'=> -1,
                'post_status'=> 'any',
                'meta_query' => [[ 'key'=>'tt_pdv_route','value'=>$s->ID,'compare'=>'=' ]],
              ]);*/
              $pdvs = MB_Relationships_API::get_connected([
                    'id' => 'routes_to_pdvs',
                    'from' => $s->ID,
                ]);

              $pdv_list = [];
              foreach ($pdvs as $p) $pdv_list[] = $this->pdv_payload($p->ID, $s->ID);

              $route_node['subroutes'][] = [
                'id'    => (string) $s->ID,
                'title' => get_the_title($s),
                'pdvs'  => $pdv_list,
              ];
            }

            $out[] = $route_node;
          }

          return $out;
        }
      ]);
    }

    /**
     * Recepción de respuestas — marca PDV como synced, guarda metadatos,
     * setea imagen destacada con la foto capturada y registra quién llenó.
     * Estructura esperada (JSON):
     * [
     *   {
     *     "pdv_id": 123,
     *     "answers": { "q1":"tienda", "q2":"si", "q3":"texto ..." },
     *     "geo": { "lat":14.6, "lng":-90.5, "accuracy":12.3 },
     *     "photo_base64": "data:image/jpeg;base64,...."   (opcional)
     *   },
     *   ...
     * ]
     */
    register_rest_route('myapp/v1', '/responses/bulk', [
      'methods'  => 'POST',
      'permission_callback' => function() { return current_user_can('read'); },
      'callback' => function($req) {

        $items = json_decode($req->get_body(), true);
        if (!is_array($items)) return new WP_Error('tt_bad_body','Formato inválido', ['status'=>400]);

        $user_id = $this->current_user_id_jwt();
        if (!$user_id) return new WP_Error('tt_no_user','No autenticado', ['status'=>401]);

        $updated = 0; $with_photos = 0;

        foreach ($items as $it) {
          $pdv_id  = isset($it['pdv_id']) ? intval($it['pdv_id']) : 0;
          if (!$pdv_id) continue;

          // Guarda metadatos de respuestas
          $answers = isset($it['answers']) && is_array($it['answers']) ? $it['answers'] : [];
          $geo     = isset($it['geo']) && is_array($it['geo']) ? $it['geo'] : [];

          update_post_meta($pdv_id, 'tt_pdv_answers', wp_json_encode($answers));
          $this->sync_pdv_answers_meta($pdv_id, $answers);
          update_post_meta($pdv_id, 'tt_pdv_geolocation', wp_json_encode($geo));
          update_post_meta($pdv_id, 'tt_pdv_filled_by', $user_id);         // 👈 quién llenó
          update_post_meta($pdv_id, 'tt_pdv_filled_at', current_time('mysql'));
          $user_obj = get_userdata($user_id);
          if ($user_obj) {
            update_post_meta($pdv_id, 'tt_pdv_filled_by_name', $user_obj->display_name);
          }

          // Foto (imagen destacada)
          if (!empty($it['photo_base64']) && is_string($it['photo_base64'])) {
            $att_id = $this->set_thumbnail_from_base64($pdv_id, $it['photo_base64']);
            if ($att_id) $with_photos++;
          }

          // Estado
          update_post_meta($pdv_id, 'tt_pdv_status', 'synced');
          $updated++;
        }

        return ['ok'=>true,'updated'=>$updated,'photos_saved'=>$with_photos,'user'=>$user_id];
      }
    ]);

    // Respuestas previamente sincronizadas del usuario autenticado
    register_rest_route('myapp/v1', '/responses/mine', [
      'methods'  => 'GET',
      'permission_callback' => function() { return current_user_can('read'); },
      'callback' => function($req) {
        $user_id = $this->current_user_id_jwt();
        if (!$user_id) return new WP_Error('tt_no_user','No autenticado', ['status'=>401]);

        $pdvs = get_posts([
          'post_type'  => 'tt_pdv',
          'numberposts'=> -1,
          'post_status'=> 'any',
          'meta_query' => [[ 'key' => 'tt_pdv_filled_by', 'value' => $user_id, 'compare' => '=' ]],
        ]);

        $out = [];
        foreach ($pdvs as $p) {
          $ans = json_decode(get_post_meta($p->ID, 'tt_pdv_answers', true), true);
          $out[] = [
            'pdv_id'    => (int) $p->ID,
            'answers'   => is_array($ans) ? $ans : [],
            'updated_at'=> get_post_meta($p->ID, 'tt_pdv_filled_at', true),
          ];
        }

        return $out;
      }
    ]);

  }

  public function rest_pdv_table(WP_REST_Request $req) {
    $draw   = intval($req->get_param('draw'));
    $start  = max(0, intval($req->get_param('start')));
    $length = intval($req->get_param('length'));
    if ($length <= 0) {
      $length = 25;
    }
    $paged = floor($start / $length) + 1;

    $schema = $this->get_pdv_table_schema();
    $map_index = $schema['map_index'];
    $map_data  = $schema['map_data'];

    $query_args = [
      'post_type'      => 'tt_pdv',
      'post_status'    => ['publish','pending','draft','future','private'],
      'posts_per_page' => $length,
      'paged'          => $paged,
      'no_found_rows'  => false,
    ];

    $meta_parts = [];

    $search = $req->get_param('search');
    if (!empty($search['value'])) {
      $sv = sanitize_text_field($search['value']);
      if ($sv !== '') {
        $query_args['s'] = $sv;
        $meta_filters = [
          'relation' => 'OR',
          ['key' => 'codigo',               'value' => $sv, 'compare' => 'LIKE'],
          ['key' => 'tt_pdv_status',        'value' => $sv, 'compare' => 'LIKE'],
          ['key' => 'tt_pdv_filled_by_name','value' => $sv, 'compare' => 'LIKE'],
          ['key' => 'tt_pdv_filled_at',     'value' => $sv, 'compare' => 'LIKE'],
          ['key' => 'tt_pdv_answers',       'value' => $sv, 'compare' => 'LIKE'],
        ];

        foreach ($schema['questions'] as $question) {
          if (!empty($question['meta_key'])) {
            $meta_filters[] = [
              'key'     => 'tt_answer_' . $question['meta_key'],
              'value'   => $sv,
              'compare' => 'LIKE',
            ];
          }
        }

        $meta_parts[] = $meta_filters;
      }
    }

    $sb_param = $req->get_param('searchBuilder');
    $sb = null;
    if (is_string($sb_param) && $sb_param !== '') {
      $sb = json_decode($sb_param, true);
      if (json_last_error() !== JSON_ERROR_NONE) {
        $sb = json_decode(stripslashes($sb_param), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
          $sb = null;
        }
      }
    } elseif (is_array($sb_param)) {
      $sb = $sb_param;
    }

    if (!empty($sb) && is_array($sb)) {
      $sb_meta = $this->sb_to_meta_query($sb, $map_data);
      if ($sb_meta) {
        $meta_parts[] = $sb_meta;
      }
    }

    if (!empty($meta_parts)) {
      if (count($meta_parts) === 1) {
        $query_args['meta_query'] = $meta_parts[0];
      } else {
        $query_args['meta_query'] = array_merge(['relation' => 'AND'], $meta_parts);
      }
    }

    $order = $req->get_param('order');
    if (!empty($order) && is_array($order)) {
      $orderby = [];
      $meta_key_for_order = null;
      foreach ($order as $ord) {
        $col_index = isset($ord['column']) ? intval($ord['column']) : -1;
        if ($col_index < 0 || !isset($map_index[$col_index])) {
          continue;
        }
        $col = $map_index[$col_index];
        if (empty($col['orderable'])) {
          continue;
        }
        $dir = (isset($ord['dir']) && strtolower($ord['dir']) === 'desc') ? 'DESC' : 'ASC';

        if ($col['source'] === 'meta' && !empty($col['meta_key'])) {
          if (!$meta_key_for_order) {
            $meta_key_for_order = $col['meta_key'];
            $query_args['meta_key'] = $meta_key_for_order;
          }
          $orderby[$col['meta_type'] === 'NUMERIC' ? 'meta_value_num' : 'meta_value'] = $dir;
        } elseif ($col['source'] === 'post' && !empty($col['orderby'])) {
          $orderby[$col['orderby']] = $dir;
        }
      }

      if (!empty($orderby)) {
        $query_args['orderby'] = $orderby;
      }
    }

    $query = new WP_Query($query_args);

    $data = [];
    foreach ($query->posts as $post) {
      $data[] = $this->format_pdv_table_row($post->ID, $schema);
    }
    wp_reset_postdata();

    $counts = wp_count_posts('tt_pdv');
    $total = 0;
    if ($counts instanceof stdClass) {
      foreach (['publish','pending','draft','future','private'] as $status) {
        if (isset($counts->$status)) {
          $total += (int) $counts->$status;
        }
      }
    }
    if ($total === 0 && $counts instanceof stdClass && isset($counts->publish)) {
      $total = (int) $counts->publish;
    }

    return new WP_REST_Response([
      'draw'            => $draw,
      'recordsTotal'    => $total,
      'recordsFiltered' => intval($query->found_posts),
      'data'            => $data,
    ], 200);
  }

  public function rest_reset_pdv(WP_REST_Request $req) {
    $pdv_id = intval($req->get_param('pdv_id'));
    if (!$pdv_id) {
      return new WP_Error('tt_invalid_pdv', 'Punto de venta inválido', ['status' => 400]);
    }

    $post = get_post($pdv_id);
    if (!$post || $post->post_type !== 'tt_pdv') {
      return new WP_Error('tt_invalid_pdv', 'Punto de venta inválido', ['status' => 404]);
    }

    $this->reset_pdv_metadata($pdv_id);

    $schema = $this->get_pdv_table_schema();
    $row = $this->format_pdv_table_row($pdv_id, $schema);

    return new WP_REST_Response([
      'ok' => true,
      'pdv_id' => $pdv_id,
      'row' => $row,
    ], 200);
  }

  public function rest_trash_pdv(WP_REST_Request $req) {
    $pdv_id = intval($req->get_param('pdv_id'));
    if (!$pdv_id) {
      return new WP_Error('tt_invalid_pdv', 'Punto de venta inválido', ['status' => 400]);
    }

    $post = get_post($pdv_id);
    if (!$post || $post->post_type !== 'tt_pdv') {
      return new WP_Error('tt_invalid_pdv', 'Punto de venta inválido', ['status' => 404]);
    }

    if ($post->post_status === 'trash') {
      return new WP_REST_Response([
        'ok' => true,
        'pdv_id' => $pdv_id,
        'trashed' => true,
      ], 200);
    }

    $trashed = wp_trash_post($pdv_id);
    if ($trashed === false || is_wp_error($trashed)) {
      return new WP_Error('tt_trash_failed', 'No se pudo eliminar el punto de venta.', ['status' => 500]);
    }

    clean_post_cache($pdv_id);

    return new WP_REST_Response([
      'ok' => true,
      'pdv_id' => $pdv_id,
      'trashed' => true,
    ], 200);
  }

  private function reset_pdv_metadata($pdv_id) {
    $meta_keys = [
      'tt_pdv_answers',
      'tt_pdv_geolocation',
      'tt_pdv_filled_by',
      'tt_pdv_filled_at',
      'tt_pdv_filled_by_name',
    ];

    foreach ($meta_keys as $meta_key) {
      delete_post_meta($pdv_id, $meta_key);
    }

    $questions = $this->build_catalog_questions();
    foreach ($questions as $question) {
      if (empty($question['meta_key'])) {
        continue;
      }
      delete_post_meta($pdv_id, 'tt_answer_' . $question['meta_key']);
    }

    update_post_meta($pdv_id, 'tt_pdv_status', 'pending');

    if (function_exists('delete_post_thumbnail')) {
      delete_post_thumbnail($pdv_id);
    }

    clean_post_cache($pdv_id);
  }

  private function enqueue_pdv_table_assets() {
    wp_enqueue_script('jquery');

    if (!wp_style_is('ttpro-datatables', 'registered')) {
      wp_register_style('ttpro-datatables', 'https://cdn.datatables.net/v/bs4/jszip-3.10.1/dt-2.3.3/b-3.2.4/b-colvis-3.2.4/b-html5-3.2.4/b-print-3.2.4/date-1.5.6/sb-1.8.3/sr-1.4.1/datatables.min.css', [], '2.3.3');
    }
    wp_enqueue_style('ttpro-datatables');

    if (!wp_style_is('ttpro-datatables-fa', 'registered')) {
      wp_register_style('ttpro-datatables-fa', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.0/css/all.min.css', [], '7.0.0');
    }
    wp_enqueue_style('ttpro-datatables-fa');

    if (!wp_script_is('ttpro-datatables', 'registered')) {
      wp_register_script('ttpro-datatables', 'https://cdn.datatables.net/v/bs4/jszip-3.10.1/dt-2.3.3/b-3.2.4/b-colvis-3.2.4/b-html5-3.2.4/b-print-3.2.4/date-1.5.6/sb-1.8.3/sr-1.4.1/datatables.min.js', ['jquery'], '2.3.3', true);
    }
    wp_enqueue_script('ttpro-datatables');

    wp_register_script('ttpro-pdv-table', plugins_url('assets/pdv-table.js', __FILE__), ['ttpro-datatables'], '1.10.1', true);
    wp_enqueue_script('ttpro-pdv-table');
  }

  public function shortcode_pdv_table($atts) {
    $atts = shortcode_atts([
      'id'       => 'ttpro-pdv-table',
      'class'    => '',
      'per_page' => 25,
    ], $atts, 'ttpro_pdv_table');

    $schema = $this->get_pdv_table_schema();
    $table_id = sanitize_html_class($atts['id']);
    if ($table_id === '') {
      $table_id = 'ttpro-pdv-table-' . uniqid();
    }

    $per_page = intval($atts['per_page']);
    if ($per_page <= 0) {
      $per_page = 25;
    }

    $table_classes = ['ttpro-pdv-table','table','table-striped','table-bordered','display','nowrap'];
    if (!empty($atts['class'])) {
      $extra_classes = preg_split('/\s+/', (string) $atts['class']);
      foreach ($extra_classes as $extra) {
        $extra = sanitize_html_class($extra);
        if ($extra !== '') {
          $table_classes[] = $extra;
        }
      }
    }
    $table_class_attr = implode(' ', array_unique($table_classes));

    $this->enqueue_pdv_table_assets();

    $config = [
      'tableId'              => $table_id,
      'restUrl'              => rest_url(self::REST_NAMESPACE . self::PDV_TABLE_ROUTE),
      'nonce'                => wp_create_nonce(self::REST_NONCE_ACTION),
      'columns'              => $schema['columns'],
      'searchBuilderColumns' => $schema['searchable_indexes'],
      'pageLength'           => $per_page,
      'ajaxMethod'           => 'POST',
      'order'                => [[0, 'asc']],
      'scrollX'              => true,
      'dom'                  => '<"bg-white border overflow-hidden pb-0 pt-3 px-3 rounded-lg" <"d-flex flex-column flex-md-row justify-content-between align-items-center"<"mb-3"B><"mb-3"f>> <"mb-3"Q> <"mb-3"t> <"align-items-center d-flex flex-column flex-md-row justify-content-between"<"mb-3"l><"mb-3"i><"mb-3"p>> >',
      'buttons'              => ['copy','csv','excel','print'],
      'rejectUrl'            => $this->user_can_manage_pdv_rejection() ? rest_url(self::REST_NAMESPACE . self::PDV_RESET_ROUTE) : '',
      'deleteUrl'            => $this->user_can_manage_pdv_rejection() ? rest_url(self::REST_NAMESPACE . self::PDV_TRASH_ROUTE) : '',
      'language'             => [
        'processing'  => 'Procesando...',
        'lengthMenu'  => 'Mostrar _MENU_ registros',
        'zeroRecords' => 'No se encontraron resultados',
        'info'        => 'Mostrando _START_ a _END_ de _TOTAL_ registros',
        'infoEmpty'   => 'Mostrando 0 registros',
        'infoFiltered'=> '(filtrado de _MAX_ registros totales)',
        'search'      => 'Buscar:',
        'paginate'    => [
          'first'    => 'Primero',
          'last'     => 'Último',
          'next'     => 'Siguiente',
          'previous' => 'Anterior',
        ],
      ],
    ];

    $config_json = wp_json_encode($config);
    if ($config_json) {
      wp_add_inline_script('ttpro-pdv-table', 'window.TTPCensoTables = window.TTPCensoTables || []; window.TTPCensoTables.push(' . $config_json . ');');
    }

    ob_start();
    ?>
    <div class="ttpro-pdv-table-wrapper">
      <table id="<?php echo esc_attr($table_id); ?>" class="<?php echo esc_attr($table_class_attr); ?>" style="width:100%">
        <thead>
          <tr>
            <?php foreach ($schema['columns'] as $col): ?>
              <th><?php echo esc_html($col['title']); ?></th>
            <?php endforeach; ?>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <?php
    return ob_get_clean();
  }

}

new TTPro_Api();
