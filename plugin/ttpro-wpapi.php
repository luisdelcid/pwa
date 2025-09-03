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
                    'include' => [
                        'is_child' => false,
                    ],
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
                    'include' => [
                        'is_child' => true,
                    ],
                ],
            ],
            'to' => [
                'object_type' => 'post',
                'post_type' => 'tt_pdv',
            ],
        ]);
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
      'callback' => function($req) {
        return [
          'version' => 2,
          'fields' => [
            ['id'=>'accion','label'=>'Acción a ejecutar','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'validar','label'=>'Validar'],
              ['value'=>'eliminar','label'=>'Eliminar'],
            ]],
            ['id'=>'motivo','label'=>'Motivo por el que se elimina','type'=>'text','required'=>false,'show_if'=>['id'=>'accion','value'=>'eliminar']],
            ['id'=>'actualizar','label'=>'Actualizar nombre y dirección','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'si','label'=>'Sí'],
              ['value'=>'no','label'=>'No'],
            ],'show_if'=>['id'=>'accion','value'=>'validar']],
            ['id'=>'nombre','label'=>'Nombre','type'=>'text','required'=>false,'show_if'=>['id'=>'actualizar','value'=>'si']],
            ['id'=>'direccion','label'=>'Dirección','type'=>'textarea','required'=>false,'show_if'=>['id'=>'actualizar','value'=>'si']],
            ['id'=>'foto','label'=>'Foto','type'=>'photo','required'=>true],
            ['id'=>'ubicacion','label'=>'Ubicación','type'=>'geo','required'=>false],
            ['id'=>'canal','label'=>'Canal del PDV','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'detalle','label'=>'Detalle'],
              ['value'=>'mayorista','label'=>'Mayorista'],
              ['value'=>'super_tradicional','label'=>'Supermercados tradicional'],
            ]],
            ['id'=>'canal_detalle','label'=>'Etiqueta del canal detalle','type'=>'radio','required'=>false,'options'=>[
              ['value'=>'reposterias','label'=>'Reposterías'],
              ['value'=>'restaurante','label'=>'Restaurante'],
              ['value'=>'restaurante_de_paso','label'=>'Restaurante de paso'],
              ['value'=>'salon_de_bellezas','label'=>'Salón de bellezas'],
              ['value'=>'tiendas_barrotes_externos','label'=>'Tiendas con barrotes externos'],
              ['value'=>'tiendas_barrotes_internos','label'=>'Tiendas con barrotes internos'],
              ['value'=>'tiendas_verdureria','label'=>'Tiendas con verdurería'],
              ['value'=>'tiendas_caseta','label'=>'Tiendas con caseta'],
              ['value'=>'tiendas_mascotas','label'=>'Tiendas de mascotas'],
              ['value'=>'tiendas_mercado','label'=>'Tiendas de mercado'],
              ['value'=>'tiendas_mostrador','label'=>'Tiendas de mostrador'],
              ['value'=>'tiendas_ventana','label'=>'Tiendas de ventana'],
              ['value'=>'veterinarias','label'=>'Veterinarias'],
            ],'show_if'=>['id'=>'canal','value'=>'detalle']],
            ['id'=>'canal_mayorista','label'=>'Etiqueta del canal mayorista','type'=>'radio','required'=>false,'options'=>[
              ['value'=>'mayorista_puro','label'=>'Mayorista puro'],
              ['value'=>'semi_mayoreo','label'=>'Semi mayoreo'],
              ['value'=>'mayoreo_autoservicios','label'=>'Mayoreo con autoservicios'],
            ],'show_if'=>['id'=>'canal','value'=>'mayorista']],
            ['id'=>'canal_super','label'=>'Etiqueta del canal supermercados tradicional','type'=>'radio','required'=>false,'options'=>[
              ['value'=>'super_independientes','label'=>'Supermercados independientes'],
              ['value'=>'mini_markets','label'=>'Mini markets'],
              ['value'=>'food_shops','label'=>'Food shops'],
            ],'show_if'=>['id'=>'canal','value'=>'super_tradicional']],
            ['id'=>'tamano','label'=>'Tamaño del PDV','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'grande','label'=>'Grande'],
              ['value'=>'mediano','label'=>'Mediano'],
              ['value'=>'pequeno','label'=>'Pequeño'],
            ]],
            ['id'=>'puertas_frio','label'=>'Cantidad de puertas en frío','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'0-5','label'=>'0-5'],
              ['value'=>'6-11','label'=>'6-11'],
              ['value'=>'12+','label'=>'12 en adelante'],
            ]],
            ['id'=>'congeladores','label'=>'Cantidad de congeladores','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'0','label'=>'Ninguno, solo el de mi refri'],
              ['value'=>'1','label'=>'1'],
              ['value'=>'2','label'=>'2'],
              ['value'=>'3','label'=>'3'],
              ['value'=>'4','label'=>'4'],
              ['value'=>'5+','label'=>'Más de 5'],
            ]],
            ['id'=>'botellas','label'=>'Vende botellas de licor 750 ml (ejemplo XL, Ron Botrán, Quetzalteca u otras)','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'si','label'=>'Sí'],
              ['value'=>'no','label'=>'No'],
            ]],
            ['id'=>'mascotas','label'=>'Vende alimentos para mascotas a granel libreado directamente del saco','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'si','label'=>'Sí'],
              ['value'=>'no','label'=>'No'],
            ]],
            ['id'=>'cigarros','label'=>'Vende cigarros','type'=>'radio','required'=>true,'options'=>[
              ['value'=>'si','label'=>'Sí'],
              ['value'=>'no','label'=>'No'],
            ]],
          ]
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
          $routes = MB_Relationships_API::get_connected([
              'id' => 'users_to_routes',
              'from' => $user_id,
          ]);
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
