(function($){
  function initTable(cfg){
    if (!cfg || !cfg.tableId){
      return;
    }
    if (!$.fn || typeof $.fn.DataTable !== 'function'){
      return;
    }

    var $table = $('#' + cfg.tableId);
    if (!$table.length){
      return;
    }

    var columns = [];
    var rawColumns = cfg.columns || [];
    for (var i = 0; i < rawColumns.length; i++){
      var col = rawColumns[i] || {};
      var colDef = {
        data: col.data || null,
        title: col.title || '',
        orderable: col.orderable !== false,
        searchable: col.searchable === true,
        defaultContent: ''
      };
      if (col.className){
        colDef.className = col.className;
      }
      columns.push(colDef);
    }

    var ajaxHeaders = {};
    if (cfg.nonce){
      ajaxHeaders['X-WP-Nonce'] = cfg.nonce;
    }

    var ajaxMethod = cfg.ajaxMethod || 'POST';

    var dt = $table.DataTable({
      processing: true,
      serverSide: true,
      ajax: {
        url: cfg.restUrl || '',
        type: ajaxMethod,
        headers: ajaxHeaders,
        data: function(d){
          try {
            if (dt.searchBuilder && typeof dt.searchBuilder.getDetails === 'function'){
              var sbDetails = dt.searchBuilder.getDetails();
              if (sbDetails){
                d.searchBuilder = sbDetails;
              }
            }
          } catch(e){}
          return d;
        }
      },
      columns: columns,
      order: cfg.order || [[0, 'asc']],
      pageLength: cfg.pageLength || 25,
      dom: cfg.dom || '<"ttpro-table-toolbar"BfQ>t<"ttpro-table-footer"lip>',
      buttons: cfg.buttons || ['copy','csv','excel','print'],
      language: cfg.language || {},
      scrollX: cfg.scrollX === false ? false : true,
      responsive: cfg.responsive || false,
      searchBuilder: $.extend({ columns: cfg.searchBuilderColumns || undefined }, cfg.searchBuilder || {})
    });

    $table.on('searchBuilder-change', function(){
      dt.ajax.reload();
    });

    if (cfg.rejectUrl){
      $table.on('click', '.ttpro-pdv-reject-btn', function(ev){
        ev.preventDefault();

        var $btn = $(this);
        var pdvId = $btn.data('pdv-id');
        if (!pdvId){
          return;
        }

        if (!window.confirm('¿Deseas rechazar este punto de venta? Se borrará la información capturada.')){
          return;
        }

        $btn.prop('disabled', true).addClass('ttpro-pdv-reject-btn--loading');

        $.ajax({
          url: cfg.rejectUrl,
          method: 'POST',
          headers: ajaxHeaders,
          data: { pdv_id: pdvId }
        }).done(function(){
          dt.ajax.reload(null, false);
        }).fail(function(xhr){
          var message = 'No se pudo rechazar el punto de venta.';
          if (xhr && xhr.responseJSON && xhr.responseJSON.message){
            message = xhr.responseJSON.message;
          }
          window.alert(message);
        }).always(function(){
          $btn.prop('disabled', false).removeClass('ttpro-pdv-reject-btn--loading');
        });
      });
    }
  }

  $(function(){
    if (!window.TTPCensoTables || !Array.isArray(window.TTPCensoTables)){
      return;
    }
    for (var i = 0; i < window.TTPCensoTables.length; i++){
      initTable(window.TTPCensoTables[i]);
    }
  });
})(jQuery);
