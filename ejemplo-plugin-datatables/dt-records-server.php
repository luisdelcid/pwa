<?php
/*
Plugin Name: DT Records Server
Description: CPT + REST endpoint para DataTables (server-side) con soporte de SearchBuilder (anidado), Seeder y configuración usando Meta Box (MB Settings Page).
Version: 1.1.0
Author: Tu Nombre
*/
if (!defined('ABSPATH')) exit;

class DT_Records_Server_MB {
    const CPT = 'dt_record';
    const REST_NS = 'dt/v1';
    const REST_ROUTE = '/records';
    const NONCE_ACTION = 'wp_rest';
    const OPT_GROUP = 'dt_records_settings'; // option_name para MB Settings Page

    public function __construct(){
        add_action('init',               [$this,'register_cpt']);
        add_action('init',               [$this,'register_meta']);
        add_action('rest_api_init',      [$this,'register_routes']);
        add_shortcode('dt_records_table',[$this,'shortcode_table']);
        add_action('wp_enqueue_scripts', [$this,'enqueue_frontend_assets']);
        add_action('admin_enqueue_scripts', [$this,'enqueue_admin_assets']);

        // Meta Box integration
        add_action('admin_init',         [$this,'check_metabox_dependency']);
        add_filter('mb_settings_pages',  [$this,'mb_settings_pages']);
        add_filter('rwmb_meta_boxes',    [$this,'register_metabox_fields']);

        // Seeder handlers (botones en Settings Page renderizados con custom_html)
        add_action('admin_post_dt_seed_generate', [$this,'handle_seed_generate']);
        add_action('admin_post_dt_seed_truncate', [$this,'handle_seed_truncate']);
    }

    /*----------------------------------*
     * Dependency check (Meta Box)
     *----------------------------------*/
    public function check_metabox_dependency(){
        if (!class_exists('RW_Meta_Box')) {
            add_action('admin_notices', function(){
                echo '<div class="notice notice-error"><p><strong>DT Records Server</strong>: requiere el plugin <a href="https://metabox.io" target="_blank">Meta Box</a> activo (y la extensión <code>MB Settings Page</code>) para mostrar la configuración y los campos en el admin.</p></div>';
            });
        }
    }

    /*----------------------------------*
     * CPT & Meta
     *----------------------------------*/
    public function register_cpt(){
        register_post_type(self::CPT, [
            'labels' => ['name'=>'DT Records','singular_name'=>'DT Record'],
            'public'=>false,'show_ui'=>true,'show_in_menu'=>true,'menu_icon'=>'dashicons-database','supports'=>['title'],
        ]);
    }

    // Registrar meta para exponerlos en REST (Meta Box guarda valores; esto habilita show_in_rest y tipos)
    public function register_meta(){
        $metas = [
            'first_name' => 'string',
            'last_name'  => 'string',
            'position'   => 'string',
            'office'     => 'string',
            'start_date' => 'string', // YYYY-MM-DD
            'salary'     => 'number', // numeric
        ];
        foreach($metas as $key=>$type){
            register_post_meta(self::CPT, $key, [
                'type' => $type,
                'single' => true,
                'show_in_rest' => true,
                'auth_callback' => function(){ return current_user_can('read'); }
            ]);
        }
    }

    /*----------------------------------*
     * REST
     *----------------------------------*/
    public function register_routes(){
        register_rest_route(self::REST_NS, self::REST_ROUTE, [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this,'rest_list_records'],
                'permission_callback' => '__return_true',
            ]
        ]);
    }

    protected function columns_map(){
        return [
            0=>['data'=>'first_name','type'=>'meta','orderby'=>true],
            1=>['data'=>'last_name','type'=>'meta','orderby'=>true],
            2=>['data'=>'position','type'=>'meta','orderby'=>true],
            3=>['data'=>'office','type'=>'meta','orderby'=>true],
            4=>['data'=>'start_date','type'=>'meta','orderby'=>true],
            5=>['data'=>'salary','type'=>'meta','orderby'=>true],
        ];
    }

    public function rest_list_records(WP_REST_Request $req){
        $draw   = intval($req->get_param('draw'));
        $start  = max(0, intval($req->get_param('start')));
        $length = intval($req->get_param('length')); if($length<=0) $length=10;
        $search = $req->get_param('search');
        $order  = $req->get_param('order');
        $sb_param = $req->get_param('searchBuilder'); $sb = null;
        if(is_string($sb_param) && $sb_param!==''){
            $sb = json_decode($sb_param, true);
            if(json_last_error()!==JSON_ERROR_NONE){
                $sb = json_decode(stripslashes($sb_param), true);
                if(json_last_error()!==JSON_ERROR_NONE){ $sb = null; }
            }
        } elseif (is_array($sb_param)) { $sb = $sb_param; }

        $paged = floor($start / $length) + 1;
        $q_args = [
            'post_type'=> self::CPT,
            'post_status'=>'publish',
            'posts_per_page'=> $length,
            'paged'=> $paged,
            'no_found_rows'=> false,
        ];

        // Global search
        if(!empty($search['value'])){
            $sv = sanitize_text_field($search['value']);
            $q_args['meta_query'] = ['relation'=>'OR',
                ['key'=>'first_name','value'=>$sv,'compare'=>'LIKE'],
                ['key'=>'last_name','value'=>$sv,'compare'=>'LIKE'],
                ['key'=>'position','value'=>$sv,'compare'=>'LIKE'],
                ['key'=>'office','value'=>$sv,'compare'=>'LIKE'],
                ['key'=>'start_date','value'=>$sv,'compare'=>'LIKE'],
                ['key'=>'salary','value'=>$sv,'compare'=>'LIKE'],
            ];
        }

        // SearchBuilder → meta_query (nested)
        if(!empty($sb) && is_array($sb)){
            $mq = $this->sb_to_meta_query($sb);
            if($mq){
                if(!empty($q_args['meta_query'])){
                    $q_args['meta_query'] = ['relation'=>'AND', $q_args['meta_query'], $mq ];
                } else { $q_args['meta_query'] = $mq; }
            }
        }

        // Ordering
        if(!empty($order) && is_array($order)){
            $map=$this->columns_map(); $orderby=[]; $meta_key=null;
            foreach($order as $ord){
                $col_index=intval($ord['column']); $dir=(isset($ord['dir']) && strtolower($ord['dir'])==='desc')?'DESC':'ASC';
                if(isset($map[$col_index])){
                    $col=$map[$col_index];
                    if($col['type']==='meta' && !$meta_key){
                        $meta_key=$col['data']; $q_args['meta_key']=$meta_key;
                        $orderby[$meta_key==='salary'?'meta_value_num':'meta_value']=$dir;
                    } elseif(!empty($col['wp'])) {
                        $orderby[$col['wp']]=$dir;
                    }
                }
            }
            if(!empty($orderby)) $q_args['orderby']=$orderby;
        }

        $query = new WP_Query($q_args);

        $total=0; $counts=wp_count_posts(self::CPT); if(!empty($counts->publish)) $total=intval($counts->publish);
        $data=[]; foreach($query->posts as $p){ $data[]=$this->format_row($p->ID); }

        // Debug opcional desde ajustes
        $opts = get_option(self::OPT_GROUP, []);
        if(!empty($opts['debug_json'])){
            return new WP_REST_Response([
                'debug'=>[ 'sb'=>$sb, 'query_args'=>$q_args ],
                'draw'=>$draw, 'recordsTotal'=>$total, 'recordsFiltered'=>intval($query->found_posts), 'data'=>$data
            ],200);
        }

        return new WP_REST_Response([ 'draw'=>$draw, 'recordsTotal'=>$total, 'recordsFiltered'=>intval($query->found_posts), 'data'=>$data ],200);
    }

    protected function format_row($post_id){
        return [
            'first_name'=> get_post_meta($post_id,'first_name',true)?:'',
            'last_name' => get_post_meta($post_id,'last_name',true)?:'',
            'position'  => get_post_meta($post_id,'position',true)?:'',
            'office'    => get_post_meta($post_id,'office',true)?:'',
            'start_date'=> get_post_meta($post_id,'start_date',true)?:'',
            'salary'    => (float) get_post_meta($post_id,'salary',true),
        ];
    }

    /*----------------------------------*
     * SearchBuilder parsing (nested)
     *----------------------------------*/
    protected function sb_to_meta_query($node){
        if(isset($node['criteria']) && is_array($node['criteria'])){
            $relation = (!empty($node['logic']) && strtoupper($node['logic'])==='OR') ? 'OR' : 'AND';
            $parts = ['relation'=>$relation];
            foreach($node['criteria'] as $child){
                if(isset($child['criteria']) && is_array($child['criteria'])){
                    $sub = $this->sb_to_meta_query($child);
                    if($sub) $parts[] = $sub;
                } else {
                    $leaf = $this->criterion_to_meta_clause($child);
                    if($leaf) $parts[] = $leaf;
                }
            }
            return (count($parts)>1) ? $parts : null;
        }
        return $this->criterion_to_meta_clause($node);
    }

    protected function normalize_numeric($val){
        if (is_array($val)){
            $out = [];
            foreach($val as $v){
                $n = preg_replace('/[^0-9\.-]/', '', (string)$v);
                if ($n === '' || $n === '-' || $n === '.' || $n === '-.' ) continue;
                $out[] = $n + 0;
            }
            return $out;
        } else {
            $n = preg_replace('/[^0-9\.-]/', '', (string)$val);
            if ($n === '' || $n === '-' || $n === '.' || $n === '-.' ) return null;
            return $n + 0;
        }
    }

    protected function criterion_to_meta_clause($c){
        if (empty($c['data']) && empty($c['origData'])) return null;
        if (empty($c['condition'])) return null;

        $key_raw = !empty($c['origData']) ? $c['origData'] : $c['data'];
        $key = sanitize_key($key_raw);
        $cond = is_string($c['condition']) ? strtolower($c['condition']) : $c['condition'];

        $v = null;
        if (isset($c['value'])){
            $v = $c['value'];
        } elseif (isset($c['value1']) || isset($c['value2'])){
            $v = [];
            if (isset($c['value1'])) $v[] = $c['value1'];
            if (isset($c['value2'])) $v[] = $c['value2'];
        }
        if (is_array($v) && count($v)===1) $v = reset($v);
        if (is_string($v)) $v = trim(wp_unslash($v));

        $is_numeric_key = ($key === 'salary');
        $meta_type = $is_numeric_key ? 'NUMERIC' : 'CHAR';

        if ($is_numeric_key && $v !== null){
            $v = $this->normalize_numeric($v);
            if ($v === null || (is_array($v) && empty($v))) return null;
        }

        switch($cond){
            case '=': case 'equals':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'compare'=>'='];
            case '!=': case 'not':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'compare'=>'!='];
            case 'contains':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'compare'=>'LIKE'];
            case '!contains':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'compare'=>'NOT LIKE'];
            case 'starts': case 'ends':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'compare'=>'LIKE'];
            case 'null':    return ['key'=>$key,'compare'=>'NOT EXISTS'];
            case '!null': case 'notnull': return ['key'=>$key,'compare'=>'EXISTS'];
            case '>': case 'gt':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'type'=>$meta_type,'compare'=>'>'];
            case '>=': case 'gte':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'type'=>$meta_type,'compare'=>'>='];
            case '<': case 'lt':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'type'=>$meta_type,'compare'=>'<'];
            case '<=': case 'lte':
                if (is_array($v)) $v = reset($v);
                return ['key'=>$key,'value'=>$v,'type'=>$meta_type,'compare'=>'<='];
            case 'between': case 'datebetween':
                if (is_array($v) && count($v)>=2){
                    return ['relation'=>'AND',
                        ['key'=>$key,'value'=>$v[0],'compare'=>'>=','type'=>$meta_type],
                        ['key'=>$key,'value'=>$v[1],'compare'=>'<=','type'=>$meta_type],
                    ];
                }
                return null;
            case 'in':
                if (is_array($v)){
                    $or=['relation'=>'OR'];
                    foreach($v as $vv){ $or[] = ['key'=>$key,'value'=>$vv,'compare'=>'=','type'=>$meta_type]; }
                    return $or;
                }
                return ['key'=>$key,'value'=>$v,'compare'=>'=','type'=>$meta_type];
            case '!in':
                if (is_array($v)){
                    $and=['relation'=>'AND'];
                    foreach($v as $vv){ $and[] = ['key'=>$key,'value'=>$vv,'compare'=>'!=','type'=>$meta_type]; }
                    return $and;
                }
                return ['key'=>$key,'value'=>$v,'compare'=>'!=','type'=>$meta_type];
            case 'date':
                if ($key==='start_date'){ if (is_array($v)) $v = reset($v); return ['key'=>$key,'value'=>$v,'compare'=>'=']; }
                return null;
        }
        return null;
    }

    /*----------------------------------*
     * Meta Box Settings Page & Fields
     *----------------------------------*/
    public function mb_settings_pages($settings_pages){
        $settings_pages[] = [
            'id'          => 'dt-records-settings',
            'option_name' => self::OPT_GROUP,
            'menu_title'  => 'DT Records',
            'page_title'  => 'DT Records Settings',
            'parent'      => 'tools.php', // bajo "Herramientas"
            'style'       => 'menu',
            'tabs'        => [
                'general' => 'General',
                'seeder'  => 'Seeder',
            ],
        ];
        return $settings_pages;
    }

    public function register_metabox_fields($meta_boxes){
        // Fields para CPT DT Record (usa Meta Box core)
        $meta_boxes[] = [
            'title'      => 'Record Fields',
            'post_types' => [ self::CPT ],
            'fields'     => [
                [ 'name'=>'First Name', 'id'=>'first_name', 'type'=>'text', 'required'=>true ],
                [ 'name'=>'Last Name',  'id'=>'last_name',  'type'=>'text', 'required'=>true ],
                [ 'name'=>'Position',   'id'=>'position',   'type'=>'text' ],
                [ 'name'=>'Office',     'id'=>'office',     'type'=>'text' ],
                [ 'name'=>'Start Date', 'id'=>'start_date', 'type'=>'date', 'js_options'=>['dateFormat'=>'yy-mm-dd'] ],
                [ 'name'=>'Salary',     'id'=>'salary',     'type'=>'number', 'step'=>'1', 'min'=>0 ],
            ],
        ];

        // Settings page: General
        $meta_boxes[] = [
            'id'             => 'dt-records-settings-general',
            'settings_pages' => ['dt-records-settings'],
            'tab'            => 'general',
            'title'          => 'General',
            'fields'         => [
                [ 'name'=>'Page length por defecto', 'id'=>'page_length', 'type'=>'number', 'min'=>1, 'std'=>10 ],
                [ 'name'=>'Debug JSON en endpoint',  'id'=>'debug_json',  'type'=>'switch', 'style'=>'rounded', 'std'=>0, 'desc'=>'Incluye "debug" con meta_query y args en la respuesta del endpoint' ],
            ],
        ];

        // Settings page: Seeder (botones via custom_html)
        $gen_url = wp_nonce_url( admin_url('admin-post.php?action=dt_seed_generate'), 'dt_seed_generate' );
        $del_url = wp_nonce_url( admin_url('admin-post.php?action=dt_seed_truncate'), 'dt_seed_truncate' );
        $meta_boxes[] = [
            'id'             => 'dt-records-settings-seeder',
            'settings_pages' => ['dt-records-settings'],
            'tab'            => 'seeder',
            'title'          => 'Seeder de datos',
            'fields'         => [
                [ 'name'=>'Cantidad a generar', 'id'=>'seed_qty', 'type'=>'number', 'min'=>1, 'std'=>25 ],
                [ 'type'=>'custom_html', 'std'=> '<a href="'.$gen_url.'" class="button button-primary">Generar datos</a> <a href="'.$del_url.'" class="button button-secondary" onclick="return confirm(\'¿Seguro que deseas borrar TODOS los registros?\')">Eliminar todos</a>' ],
                [ 'type'=>'custom_html', 'std'=> '<p>Tip: Ajusta la cantidad y luego presiona "Generar datos".</p>' ],
            ],
        ];

        return $meta_boxes;
    }

    /*----------------------------------*
     * Admin assets (pequeño CSS)
     *----------------------------------*/
    public function enqueue_admin_assets($hook){
        if( $hook === 'tools_page_dt-records-settings' ){
            wp_enqueue_style('dt-rec-admin', plugins_url('assets/admin.css', __FILE__), [], '1.1.0');
            wp_enqueue_script('dt-rec-admin', plugins_url('assets/admin.js', __FILE__), ['jquery'], '1.1.0', true);
        }
    }

    /*----------------------------------*
     * Seeder Handlers (usando Settings Page)
     *----------------------------------*/
    public function handle_seed_generate(){
        if(!current_user_can('manage_options')) wp_die('Permisos insuficientes');
        check_admin_referer('dt_seed_generate');
        $opts = get_option(self::OPT_GROUP, []);
        $qty = isset($opts['seed_qty']) ? max(1, intval($opts['seed_qty'])) : 25;

        $firstNames=['Tiger','Garrett','Ashton','Cedric','Airi','Brielle','Herrod','Rhona','Colleen','Sonya','Jena','Quinn','Haley','Tatyana','Michael','Donna','Suki','Jerome','Gavin','Shou','Jonas'];
        $lastNames=['Nixon','Winters','Cox','Kelly','Satou','Williamson','Chandler','Davidson','Hurst','Frost','Gaines','Flynn','Kennedy','Fitzpatrick','Silva','Snider','Burks','Bell','Ito','Alexander'];
        $positions=['System Architect','Accountant','Junior Technical Author','Senior Javascript Developer','Integration Specialist','Sales Assistant','Software Engineer','Chief Executive Officer (CEO)','Pre-Sales Support','Support Lead','Regional Director','Marketing Designer'];
        $offices=['Edinburgh','Tokyo','San Francisco','New York','London','Singapore'];

        for($i=0;$i<$qty;$i++){
            $fn=$firstNames[array_rand($firstNames)]; $ln=$lastNames[array_rand($lastNames)]; $title=$fn.' '.$ln;
            $post_id=wp_insert_post(['post_type'=>self::CPT,'post_status'=>'publish','post_title'=>$title]);
            if($post_id){
                update_post_meta($post_id,'first_name',$fn);
                update_post_meta($post_id,'last_name',$ln);
                update_post_meta($post_id,'position',$positions[array_rand($positions)]);
                update_post_meta($post_id,'office',$offices[array_rand($offices)]);
                $ts=strtotime('-'.rand(0,3650).' days'); update_post_meta($post_id,'start_date',date('Y-m-d',$ts));
                update_post_meta($post_id,'salary',rand(40000,300000));
            }
        }
        wp_safe_redirect( admin_url('tools.php?page=dt-records-settings#tab-seeder&seeded='.$qty) ); exit;
    }

    public function handle_seed_truncate(){
        if(!current_user_can('manage_options')) wp_die('Permisos insuficientes');
        check_admin_referer('dt_seed_truncate');
        $q=new WP_Query(['post_type'=>self::CPT,'post_status'=>'any','posts_per_page'=>-1,'fields'=>'ids']);
        foreach($q->posts as $pid){ wp_delete_post($pid,true); }
        wp_safe_redirect( admin_url('tools.php?page=dt-records-settings#tab-seeder&truncated=1') ); exit;
    }

    /*----------------------------------*
     * Shortcode + Front assets
     *----------------------------------*/
    public function enqueue_frontend_assets(){
        wp_enqueue_script('jquery');
        wp_enqueue_style('dashicons');

        /*
        wp_enqueue_style('dt-bs4','https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap4.min.css',[], '1.13.8');
        wp_enqueue_style('dt-sb','https://cdn.datatables.net/searchbuilder/1.7.1/css/searchBuilder.bootstrap4.min.css',['dt-bs4'],'1.7.1');
        wp_enqueue_style('dt-dt','https://cdn.datatables.net/datetime/1.5.2/css/dataTables.dateTime.min.css',[],'1.5.2');

        wp_enqueue_script('dt-core','https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js',['jquery'],'1.13.8',true);
        wp_enqueue_script('dt-bs4','https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap4.min.js',['dt-core'],'1.13.8',true);
        wp_enqueue_script('dt-dt','https://cdn.datatables.net/datetime/1.5.2/js/dataTables.dateTime.min.js',['dt-core'],'1.5.2',true);
        wp_enqueue_script('dt-sb','https://cdn.datatables.net/searchbuilder/1.7.1/js/dataTables.searchBuilder.min.js',['dt-core','dt-dt'],'1.7.1',true);
        wp_enqueue_script('dt-sb-bs','https://cdn.datatables.net/searchbuilder/1.7.1/js/searchBuilder.bootstrap4.min.js',['dt-sb'],'1.7.1',true);
        */

        wp_enqueue_style('dt', 'https://cdn.datatables.net/v/bs4/jszip-3.10.1/dt-2.3.3/b-3.2.4/b-colvis-3.2.4/b-html5-3.2.4/b-print-3.2.4/date-1.5.6/sb-1.8.3/sr-1.4.1/datatables.min.css', [], '2.3.3');

        wp_enqueue_style('fa', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.0/css/all.min.css', [], '7.0.0');

        //wp_enqueue_script('pdfmake', 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js', [], '0.2.7', true);
        //wp_enqueue_script('vfs_fonts', 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js', [], '0.2.7', true);
        //wp_enqueue_script('dt', 'https://cdn.datatables.net/v/bs4/jszip-3.10.1/dt-2.3.3/b-3.2.4/b-colvis-3.2.4/b-html5-3.2.4/b-print-3.2.4/date-1.5.6/sb-1.8.3/sr-1.4.1/datatables.min.js', ['jquery', 'pdfmake', 'vfs_fonts'], '2.3.3', true);
        wp_enqueue_script('dt', 'https://cdn.datatables.net/v/bs4/jszip-3.10.1/dt-2.3.3/b-3.2.4/b-colvis-3.2.4/b-html5-3.2.4/b-print-3.2.4/date-1.5.6/sb-1.8.3/sr-1.4.1/datatables.min.js', ['jquery'], '2.3.3', true);

        wp_register_script('dt-records-frontend',plugins_url('assets/frontend.js',__FILE__),['dt'],'1.1.0',true);

        $opts = get_option(self::OPT_GROUP, []);
        $page_length = !empty($opts['page_length']) ? intval($opts['page_length']) : 10;

        wp_localize_script('dt-records-frontend','DTRecordsCfg',[
            'restUrl'=> rest_url(self::REST_NS . self::REST_ROUTE),
            'nonce'  => wp_create_nonce(self::NONCE_ACTION),
            'pageLength' => $page_length,
        ]);

        wp_enqueue_script('dt-records-frontend');
    }

    public function shortcode_table($atts){
        $atts=shortcode_atts(['id'=>'dt-records'],$atts);
        ob_start(); ?>
        <div class="table-responsive">
          <table id="<?php echo esc_attr($atts['id']); ?>" class="table table-striped table-bordered" style="width:100%">
            <thead><tr>
              <th>First name</th><th>Last name</th><th>Position</th><th>Office</th><th>Start date</th><th>Salary</th>
            </tr></thead>
          </table>
        </div>
        <?php return ob_get_clean();
    }
}
new DT_Records_Server_MB();
