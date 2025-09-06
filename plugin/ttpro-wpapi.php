<?php
/*
Plugin Name: TT PRO API
Description: Endpoints para Todo Terreno PRO. CPTs de Rutas y PDVs. Devuelve PDVs del usuario y recibe respuestas (foto como imagen destacada, metadatos y usuario que llenó).
Version: 1.9.0
Author: TT
*/
if (!defined('ABSPATH')) exit;

class TTPro_Api {
  public function __construct() {
    add_action('init',               [$this,'register_cpts']);
    add_action('rest_api_init',      [$this,'register_routes']);
    add_action('mb_relationships_init', [$this,'register_relationships']);
    add_filter('mb_settings_pages',  [$this,'register_settings_pages']);
    add_filter('rwmb_meta_boxes',    [$this,'register_settings_fields']);
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
                'photo'    => 'Photo',
                'geo'      => 'Geo',
              ],
              'std'     => 'text',
            ],
            [
              'id'   => 'required',
              'name' => 'Requerido',
              'type' => 'checkbox',
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

  /* ===================== REST ===================== */
  public function register_routes() {

    // Diagnóstico
    register_rest_route('myapp/v1', '/ping', [
      'methods'  => 'GET',
      'permission_callback' => '__return_true',
      'callback' => function() { return ['ok'=>true,'plugin'=>'ttpro-wpapi','version'=>'1.9.0']; }
    ]);

    // Catálogos (protegido)
    register_rest_route('myapp/v1', '/catalogs', [
      'methods'  => 'GET',
      'permission_callback' => function() { return current_user_can('read'); },
      //'permission_callback' => '__return_true',
      'callback' => function($req) {
        //$questions = mb_get_option('questions', 'ttpro_catalogs');
        $questions = rwmb_meta('questions', ['object_type' => 'setting'], 'ttpro_catalogs' );
        //$questions = get_option('ttpro_catalogs', []);
        //return $questions;
        if (!is_array($questions)) {
          $questions = [];
        }

        $fields = [];
        foreach ($questions as $q) {
          $field = [
            'id'       => isset($q['qid']) ? $q['qid'] : '',
            'label'    => isset($q['qlabel']) ? $q['qlabel'] : '',
            'type'     => isset($q['qtype']) ? $q['qtype'] : 'text',
            'required' => !empty($q['required']),
          ];

          if (!empty($q['options']) && is_array($q['options'])) {
            $field['options'] = array_map(function ($opt) {
              return [
                'value' => isset($opt['opt_value']) ? $opt['opt_value'] : '',
                'label' => isset($opt['opt_label']) ? $opt['opt_label'] : '',
              ];
            }, $q['options']);
          }

          if (!empty($q['show_if']) && is_array($q['show_if'])) {
            $conds = array_map(function ($cond) {
              return [
                'id'    => isset($cond['cond_id']) ? $cond['cond_id'] : '',
                'value' => isset($cond['cond_value']) ? $cond['cond_value'] : '',
              ];
            }, $q['show_if']);
            if (count($conds) === 1) {
              $field['show_if'] = $conds[0];
            } elseif (count($conds) > 1) {
              $field['show_if'] = $conds;
            }
          }

          $fields[] = $field;
        }

        return [
          'version' => 2,
          'fields'  => $fields,
        ];
      }
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
          update_post_meta($pdv_id, 'tt_pdv_geolocation', wp_json_encode($geo));
          update_post_meta($pdv_id, 'tt_pdv_filled_by', $user_id);         // 👈 quién llenó
          update_post_meta($pdv_id, 'tt_pdv_filled_at', current_time('mysql'));

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

  }

}

new TTPro_Api();
