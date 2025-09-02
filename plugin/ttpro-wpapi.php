<?php
/*
Plugin Name: TT PRO API
Description: Endpoints para Todo Terreno PRO. CPTs de Rutas y PDVs. Devuelve PDVs del usuario y recibe respuestas (foto como imagen destacada, metadatos y usuario que llenó). Incluye seeder (UI en Herramientas).
Version: 1.9.0
Author: TT
*/
if (!defined('ABSPATH')) exit;

class TTPro_Api {
  public function __construct() {
    add_action('init',               [$this,'register_cpts']);
    add_action('rest_api_init',      [$this,'register_routes']);
    add_action('admin_menu',         [$this,'admin_menu']);
    add_action('admin_post_ttpro_seed_demo', [$this,'handle_seed_demo']);
    add_action('admin_notices',      [$this,'admin_notices']);
    add_action('add_meta_boxes',     [$this,'register_meta_boxes']);
  }

  /* ===================== CPTs ===================== */
  public function register_cpts() {
    register_post_type('tt_route', [
      'label'        => 'Rutas',
      'public'       => false,
      'show_ui'      => true,
      'supports'     => ['title','author','custom-fields'],
      'show_in_rest' => false,
      'menu_position'=> 25,
      'hierarchical' => true,
      'rewrite'      => ['slug' => 'ruta', 'with_front' => false],
    ]);

    register_post_type('tt_pdv', [
      'label'        => 'Puntos de Venta',
      'public'       => false,
      'show_ui'      => true,
      'supports'     => ['title','author','thumbnail','custom-fields'], // 👈 imagen destacada + custom fields
      'show_in_rest' => false,
      'menu_position'=> 26,
    ]);
  }

  public function register_meta_boxes() {
    add_meta_box('tt_route_meta', 'Metadatos de Ruta', [$this,'render_route_meta'], 'tt_route');
    add_meta_box('tt_pdv_meta',   'Metadatos de PDV',   [$this,'render_pdv_meta'],   'tt_pdv');
  }

  public function render_route_meta($post) {
    $meta = get_post_meta($post->ID);
    echo '<h4>Metadatos</h4><pre>' . esc_html(print_r($meta, true)) . '</pre>';

    $subroutes = get_posts([
      'post_type'  => 'tt_route',
      'numberposts'=> -1,
      'post_parent'=> $post->ID,
      'post_status'=> 'any'
    ]);
    if ($subroutes) {
      echo '<h4>Sub-rutas</h4><ul>';
      foreach ($subroutes as $sr) {
        $pdvs = get_posts([
          'post_type'   => 'tt_pdv',
          'numberposts' => -1,
          'post_status' => 'any',
          'meta_key'    => '_tt_pdv_subroute',
          'meta_value'  => $sr->ID,
        ]);
        $link  = get_edit_post_link($sr->ID);
        $count = is_array($pdvs) ? count($pdvs) : 0;
        echo '<li><a href="' . esc_url($link) . '">' . esc_html(get_the_title($sr)) . '</a> (' . intval($count) . ' PDVs)</li>';
      }
      echo '</ul>';
    }
  }

  public function render_pdv_meta($post) {
    $meta = get_post_meta($post->ID);
    echo '<h4>Metadatos</h4><pre>' . esc_html(print_r($meta, true)) . '</pre>';

    $sub_id = (int) get_post_meta($post->ID, '_tt_pdv_subroute', true);
    if ($sub_id) {
      $route_id = wp_get_post_parent_id($sub_id);
      $link     = get_edit_post_link($sub_id);
      echo '<p><strong>Sub-ruta:</strong> <a href="' . esc_url($link) . '">' . esc_html(get_the_title($sub_id)) . '</a></p>';
      if ($route_id) {
        $linkr = get_edit_post_link($route_id);
        echo '<p><strong>Ruta:</strong> <a href="' . esc_url($linkr) . '">' . esc_html(get_the_title($route_id)) . '</a></p>';
      }
    }
  }

  /* ===================== Helpers ===================== */
  private function current_user_id_jwt() {
    return get_current_user_id(); // sesión normal o JWT
  }

  private function route_assigned_to_user($route_id, $user_id) {
    $assigned = (int) get_post_meta($route_id, '_tt_route_user', true);
    return $assigned === (int)$user_id;
  }

  private function pdv_payload($pdv_id, $route_id = 0, $subroute_id = 0) {
    $status      = (string) get_post_meta($pdv_id, '_tt_pdv_status', true);
    $code        = (string) get_post_meta($pdv_id, '_tt_pdv_code', true);
    $address     = (string) get_post_meta($pdv_id, '_tt_pdv_address', true);
    $route_title    = $route_id ? get_the_title($route_id) : '';
    $subroute_title = $subroute_id ? get_the_title($subroute_id) : '';
    return [
      'id'      => (string) $pdv_id,
      'code'    => $code ?: '',
      'name'    => get_the_title($pdv_id),
      'address' => $address ?: '',
      'status'  => $status ?: 'pending', // pending | filled | synced
      'route'   => [ 'id' => (string)$route_id, 'title' => $route_title ],
      'subroute'=> [ 'id' => (string)$subroute_id, 'title' => $subroute_title ],
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
      'callback' => function() { return ['ok'=>true,'plugin'=>'ttpro-wpapi','version'=>'1.8.1']; }
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

    // PDVs del usuario autenticado — alias con guion bajo y medio
    foreach (['/pdvs_all','/pdvs-all'] as $route_path) {
      register_rest_route('myapp/v1', $route_path, [
        'methods'  => 'GET',
        'permission_callback' => function() { return current_user_can('read'); },
        'callback' => function($req) {
          $user_id = $this->current_user_id_jwt();
          if (!$user_id) return new WP_Error('tt_no_user','No autenticado', ['status'=>401]);

          // Rutas asignadas al usuario mediante metadatos
          $routes = get_posts([
            'post_type'   => 'tt_route',
            'numberposts' => -1,
            'post_parent' => 0,
            'post_status' => 'any',
            'meta_key'    => '_tt_route_user',
            'meta_value'  => $user_id,
          ]);
          if (empty($routes)) return [];

          $out = [];
          foreach ($routes as $r) {
            $route_id = $r->ID;
            $route_item = [
              'id' => (string)$route_id,
              'title' => get_the_title($route_id),
              'subroutes' => []
            ];
            $subroutes = get_posts([
              'post_type'   => 'tt_route',
              'numberposts' => -1,
              'post_parent' => $route_id,
              'post_status' => 'any',
            ]);
            foreach ($subroutes as $sr) {
              $sub_id = $sr->ID;
              $sub_item = [
                'id' => (string)$sub_id,
                'title' => get_the_title($sub_id),
                'pdvs' => []
              ];
              $pdvs = get_posts([
                'post_type'   => 'tt_pdv',
                'numberposts' => -1,
                'post_status' => 'any',
                'meta_key'    => '_tt_pdv_subroute',
                'meta_value'  => $sub_id,
              ]);
              foreach ($pdvs as $p) {
                $sub_item['pdvs'][] = $this->pdv_payload($p->ID, $route_id, $sub_id);
              }
              $route_item['subroutes'][] = $sub_item;
            }
            $out[] = $route_item;
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

          update_post_meta($pdv_id, '_tt_pdv_answers', wp_json_encode($answers));
          update_post_meta($pdv_id, '_tt_pdv_geolocation', wp_json_encode($geo));
          update_post_meta($pdv_id, '_tt_pdv_filled_by', $user_id);         // 👈 quién llenó
          update_post_meta($pdv_id, '_tt_pdv_filled_at', current_time('mysql'));

          // Foto (imagen destacada)
          if (!empty($it['photo_base64']) && is_string($it['photo_base64'])) {
            $att_id = $this->set_thumbnail_from_base64($pdv_id, $it['photo_base64']);
            if ($att_id) $with_photos++;
          }

          // Estado
          update_post_meta($pdv_id, '_tt_pdv_status', 'synced');
          $updated++;
        }

        return ['ok'=>true,'updated'=>$updated,'photos_saved'=>$with_photos,'user'=>$user_id];
      }
    ]);

    /* ===== Opcionales por REST (admin): seeder & clear ===== */
    register_rest_route('myapp/v1', '/seed-demo', [
      'methods'  => 'GET',
      'permission_callback' => function() { return current_user_can('manage_options'); },
      'callback' => function($req) {
        $routes_n = isset($req['routes']) ? max(1, intval($req['routes'])) : 5;
        $pdvs_n   = isset($req['pdvs'])   ? max(1, intval($req['pdvs']))   : 30;
        $user = $this->find_user_from_request($req);
        if (!$user) return new WP_Error('tt_seed_user','Especifica user_id o user_login válidos', ['status'=>400]);
        if (isset($req['clear']) && intval($req['clear'])===1) { $this->seed_clear(); }
        $result = $this->seed_generate($user->ID, $routes_n, $pdvs_n);
        return ['ok'=>true] + $result;
      }
    ]);

    register_rest_route('myapp/v1', '/seed-clear', [
      'methods'  => 'GET',
      'permission_callback' => function() { return current_user_can('manage_options'); },
      'callback' => function($req) {
        $deleted = $this->seed_clear();
        return ['ok'=>true,'deleted'=>$deleted];
      }
    ]);
  }

  /* ===================== Seeder (núcleo + UI) ===================== */
  private function seed_generate($user_id, $routes_n, $pdvs_n) {
    $routes_created = 0; $pdvs_created = 0;
    $sub_names = ['UN01','UN02','UN03','UN04','UN05'];

    for ($i=1; $i<=$routes_n; $i++) {
      $r_title = sprintf('VG%02d', $i);
      $route_id = wp_insert_post([
        'post_type'   => 'tt_route',
        'post_status' => 'publish',
        'post_title'  => $r_title,
        'meta_input'  => [ '_tt_demo' => 1, '_tt_route_user' => $user_id ],
      ]);
      if (!$route_id || is_wp_error($route_id)) continue;
      $routes_created++;

      $subroutes = [];
      foreach ($sub_names as $sub) {
        $sr_title = $r_title . ' - ' . $sub;
        $sr_id = wp_insert_post([
          'post_type'   => 'tt_route',
          'post_status' => 'publish',
          'post_title'  => $sr_title,
          'post_parent' => $route_id,
          'meta_input'  => [ '_tt_demo' => 1 ],
        ]);
        if ($sr_id && !is_wp_error($sr_id)) $subroutes[] = $sr_id;
      }
      if (empty($subroutes)) continue;

      $per_sub = max(1, intval($pdvs_n / count($subroutes)));
      $counter = 1;
      foreach ($subroutes as $sr_id) {
        for ($j=1; $j<=$per_sub; $j++) {
          $code    = sprintf('%02d-%03d', $i, $counter++);
          $title   = 'PDV ' . $code;
          $address = 'Calle ' . rand(1,99) . ', Zona ' . rand(1,24);
          $status  = (rand(0,100) < 20) ? 'synced' : 'pending';

          $pdv_id = wp_insert_post([
            'post_type'   => 'tt_pdv',
            'post_status' => 'publish',
            'post_title'  => $title,
            'meta_input'  => [
              '_tt_pdv_code'     => $code,
              '_tt_pdv_address'  => $address,
              '_tt_pdv_status'   => $status,
              '_tt_pdv_subroute' => $sr_id,
              '_tt_demo'         => 1,
            ],
          ]);
          if ($pdv_id && !is_wp_error($pdv_id)) {
            $pdvs_created++;
          }
        }
      }
    }
    return ['routes_created'=>$routes_created, 'pdvs_per_route'=>$pdvs_n, 'pdvs_created'=>$pdvs_created, 'user_id'=>$user_id];
  }

  private function seed_clear() {
    $deleted = 0;
    foreach (['tt_pdv','tt_route'] as $pt) {
      $posts = get_posts([
        'post_type'  => $pt,
        'numberposts'=> -1,
        'post_status'=> 'any',
        'meta_query' => [[ 'key'=>'_tt_demo','value'=>1,'compare'=>'=' ]]
      ]);
      foreach ($posts as $p) {
        wp_delete_post($p->ID, true);
        $deleted++;
      }
    }
    return $deleted;
  }

  /* ===================== Admin UI (Tools) ===================== */
  public function admin_menu() {
    add_management_page('TT PRO Seeder','TT PRO Seeder','manage_options','ttpro-seeder',[$this,'render_admin_page']);
  }

  public function render_admin_page() {
    if (!current_user_can('manage_options')) return;
    $users = get_users(['number'=>500,'orderby'=>'display_name','order'=>'ASC']);
    ?>
    <div class="wrap">
      <h1>TT PRO Seeder</h1>
      <p>Genera contenido de demo para probar la PWA: crea Rutas y PDVs asignados a un usuario.</p>

      <form method="post" action="<?php echo esc_url( admin_url('admin-post.php') ); ?>">
        <?php wp_nonce_field('ttpro_seed_nonce','ttpro_seed_nonce'); ?>
        <input type="hidden" name="action" value="ttpro_seed_demo">

        <table class="form-table" role="presentation">
          <tr>
            <th scope="row"><label for="user_id">Usuario asignado</label></th>
            <td>
              <select id="user_id" name="user_id" style="min-width:260px;">
                <?php foreach ($users as $u): ?>
                  <option value="<?php echo esc_attr($u->ID); ?>">
                    <?php echo esc_html($u->display_name.' ('.$u->user_login.')'); ?>
                  </option>
                <?php endforeach; ?>
              </select>
              <p class="description">Selecciona el usuario que tendrá asignadas las rutas y PDVs.</p>
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="routes">Cantidad de rutas</label></th>
            <td><input name="routes" id="routes" type="number" min="1" max="200" step="1" value="5" class="small-text"> <span class="description">p. ej., 5</span></td>
          </tr>
          <tr>
            <th scope="row"><label for="pdvs">PDVs por ruta</label></th>
            <td><input name="pdvs" id="pdvs" type="number" min="1" max="1000" step="1" value="30" class="small-text"> <span class="description">p. ej., 30</span></td>
          </tr>
          <tr>
            <th scope="row">Limpiar demo previa</th>
            <td><label><input type="checkbox" name="clear" value="1" checked> Borrar primero los posts de demo existentes</label></td>
          </tr>
        </table>

        <?php submit_button('Generar demo'); ?>
      </form>

      <hr>
      <p>Diagnóstico del plugin: <a href="<?php echo esc_url( rest_url('myapp/v1/ping') ); ?>" target="_blank"><?php echo esc_html( rest_url('myapp/v1/ping') ); ?></a></p>
    </div>
    <?php
  }

  public function handle_seed_demo() {
    if (!current_user_can('manage_options')) wp_die('No autorizado');
    check_admin_referer('ttpro_seed_nonce','ttpro_seed_nonce');

    $user_id  = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
    $routes_n = isset($_POST['routes'])  ? max(1, intval($_POST['routes'])) : 5;
    $pdvs_n   = isset($_POST['pdvs'])    ? max(1, intval($_POST['pdvs']))   : 30;
    $clear    = !empty($_POST['clear']);

    if ($user_id <= 0 || !get_user_by('id',$user_id)) {
      $this->push_admin_notice('Usuario inválido.', 'error');
      wp_redirect( admin_url('tools.php?page=ttpro-seeder&ttpro_seed_done=0') ); exit;
    }

    if ($clear) $this->seed_clear();
    $result = $this->seed_generate($user_id, $routes_n, $pdvs_n);

    $msg = sprintf('Demo generada: %d rutas × %d PDVs por ruta (total %d PDVs) asignados a usuario #%d.',
      $result['routes_created'], $result['pdvs_per_route'], $result['pdvs_created'], $user_id);
    $this->push_admin_notice($msg, 'success');

    wp_redirect( admin_url('tools.php?page=ttpro-seeder&ttpro_seed_done=1') ); exit;
  }

  /* ===================== Admin notices ===================== */
  private function push_admin_notice($msg, $type='success') {
    $notices = get_transient('ttpro_seed_notices');
    if (!is_array($notices)) $notices = [];
    $notices[] = ['type'=>$type,'msg'=>$msg];
    set_transient('ttpro_seed_notices', $notices, 60); // 1 min
  }
  public function admin_notices() {
    $screen = get_current_screen();
    if (!$screen || $screen->id !== 'tools_page_ttpro-seeder') return;
    $notices = get_transient('ttpro_seed_notices');
    if (empty($notices)) return;
    delete_transient('ttpro_seed_notices');
    foreach ($notices as $n) {
      $class = $n['type']==='error' ? 'notice-error' : 'notice-success';
      printf('<div class="notice %s is-dismissible"><p>%s</p></div>',
        esc_attr($class), esc_html($n['msg']));
    }
  }
}

new TTPro_Api();
