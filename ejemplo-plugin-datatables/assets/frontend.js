(function($){
  $(function(){
    var $table = $('#dt-records');
    if(!$table.length) return;

    var ajaxUrl = (window.DTRecordsCfg && DTRecordsCfg.restUrl) ? DTRecordsCfg.restUrl : '';
    var nonce   = (window.DTRecordsCfg && DTRecordsCfg.nonce) ? DTRecordsCfg.nonce : '';
    var pageLen = (window.DTRecordsCfg && DTRecordsCfg.pageLength) ? parseInt(DTRecordsCfg.pageLength, 10) : 10;

    var dt = $table.DataTable({
      processing: true,
      serverSide: true,
      responsive: true,
      pageLength: pageLen,
      ajax: {
        url: ajaxUrl,
        type: 'GET',
        headers: { 'X-WP-Nonce': nonce },
        data: function(d){
          try {
            var api = $table.DataTable();
            if (api && api.searchBuilder && typeof api.searchBuilder.getDetails === 'function') {
              var sbApi = api.searchBuilder.getDetails();
              if (sbApi) d.searchBuilder = sbApi;
            }
          } catch(e) {}
          return d;
        }
      },
      columns: [
        { data: 'first_name' },
        { data: 'last_name' },
        { data: 'position' },
        { data: 'office' },
        { data: 'start_date' },
        { data: 'salary', render: $.fn.dataTable.render.number(',', '.', 0, '$') }
      ],
      order: [[0,'asc']],
      //dom: 'QBfrtip',
      //dom: '<"border mb-3 pb-0 pt-3 px-3 rounded"Q><"bg-light border overflow-hidden pb-0 pt-3 px-3 rounded"<"d-flex flex-column flex-md-row justify-content-between align-items-center"<"mb-3"B><"mb-3"f>><"mb-3 bg-white"t><"d-flex flex-column flex-md-row justify-content-between align-items-center"<"mb-3"l><"mb-3"i><"mb-3"p>>>',
      //dom: '<"bg-white border overflow-hidden pb-0 pt-3 px-3 rounded-lg"<"mb-3"Q><"align-items-center bg-light border d-flex flex-column flex-md-row justify-content-between mb-3 pt-3 px-3"<"mb-3"B><"mb-3"f>><"mb-3"t><"align-items-center bg-light border d-flex flex-column flex-md-row justify-content-between mb-3 pt-3 px-3"<"mb-3"l><"mb-3"i><"mb-3"p>>>',
      dom: '<"bg-white border overflow-hidden pb-0 pt-3 px-3 rounded-lg" <"d-flex flex-column flex-md-row justify-content-between align-items-center"<"mb-3"B><"mb-3"f>> <"mb-3"Q> <"mb-3"t> <"align-items-center d-flex flex-column flex-md-row justify-content-between"<"mb-3"l><"mb-3"i><"mb-3"p>> >',
      //dom: '<"bg-white border overflow-hidden pb-0 pt-3 px-3 rounded-lg"<"d-flex flex-column flex-md-row justify-content-between align-items-center"<"mb-3"B><"mb-3"f>><"mb-3"t><"align-items-center d-flex flex-column flex-md-row justify-content-between"<"mb-3"l><"mb-3"i><"mb-3"p>>>',
      searchBuilder: {
          filterChanged: function(count){
            /*if(!jQuery('.btn-custom-search').children('.counts').length){
                jQuery('.btn-custom-search').append('<span class="counts"></span>');
            }
            if(count){
                jQuery('.btn-custom-search').children('.counts').html(' <span class="badge badge-light">' + count + '</span>');
            } else {
                jQuery('.btn-custom-search').children('.counts').html('');
                jQuery('#csb').collapse('hide');
            }*/
            console.log(dt.searchBuilder.getDetails());
          }
      },
      buttons: [
          'copy',
          'csv',
          'excel',
          'print',
          /*{
              extend: 'copyHtml5',
              text: '<span class="dashicons dashicons-editor-table"></span> Copy',
              titleAttr: 'Copy',
          },
          {
              autoFilter: true,
              extend: 'excelHtml5',
              //filename: 'prueba',
              sheetName: 'Data',
              text: '<span class="dashicons dashicons-media-spreadsheet"></span> Download',
              //text: 'Download',
              title: null,
              titleAttr: 'Excel',
          },*/
          /*{
              text: '<i class="fa-solid fa-filter fa-fw"></i> Filters',
              className: 'btn-custom-search',
              titleAttr: 'Filters',
              action: function (e, dt, node, config) {
                jQuery('#csb').collapse('toggle');
              },
          },*/
          /*{
              extend: 'print',
              text: '<span class="dashicons dashicons-printer"></span> Print',
              titleAttr: 'Print',
          },*/
          /*{
              //text: '<i class="fa-solid fa-floppy-disk fa-fw"></i> Save As',
              //text: '<span class="dashicons dashicons-admin-post"></span> Save',
              text: 'Save',
              className: 'btn-custom-save',
              titleAttr: 'Save',
              action: function (e, dt, node, config) {
                //const total = dt.rows({search:'applied'}).count();
                //alert('Hay ' + total + ' filas filtradas ahora mismo.');
                // Aquí puedes disparar cualquier lógica: AJAX, modal, etc.
                //jQuery('#csb').collapse('toggle');
                alert('Save As...');
              },
          },*/
          /*{
                text: 'Reload',
                action: function ( e, dt, node, config ) {
                    dt.ajax.reload();
                }
            }*/
          /*{
              extend: 'csvHtml5',
              //filename: 'prueba',
              text: '<i class="fa-solid fa-file-csv fa-fw"></i> CSV',
              titleAttr: 'CSV',
          },
          {
              extend: 'pdfHtml5',
              //filename: 'prueba',
              orientation: 'landscape',
              text: '<i class="fa-solid fa-file-pdf fa-fw"></i> PDF',
              titleAttr: 'PDF',
          },*/
      ],
    });

    $table.on('searchBuilder-change', function(){
      dt.ajax.reload();
    });
    /*$table.on('init.dt', function(){
      console.log('ea');
  });*/
  });
})(jQuery);
