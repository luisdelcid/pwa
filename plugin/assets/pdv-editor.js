(function($){
  function parseConditions(raw){
    if (!raw){
      return [];
    }
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)){
        return parsed;
      }
      if (parsed && typeof parsed === 'object'){
        return [parsed];
      }
    } catch (e){}
    return [];
  }

  function fieldValue($form, fieldId){
    var $inputs = $form.find('[name^="ttpro_answers[' + fieldId + ']"], [name^="ttpro_geo[' + fieldId + ']"], [name^="ttpro_photo[' + fieldId + ']"]');
    if (!$inputs.length){
      return [];
    }

    var values = [];

    $inputs.each(function(){
      var $el = $(this);
      var type = ($el.attr('type') || '').toLowerCase();

      if (type === 'checkbox'){
        if ($el.prop('checked')){
          values.push($el.val());
        }
      } else if (type === 'radio'){
        if ($el.prop('checked')){
          values.push($el.val());
        }
      } else if ($el.is('select')){
        var val = $el.val();
        if (Array.isArray(val)){
          values = values.concat(val);
        } else if (val !== null && val !== undefined && val !== ''){
          values.push(val);
        }
      } else if ($el.is('input') || $el.is('textarea')){
        var v = $el.val();
        if (v !== null && v !== undefined && String(v).trim() !== ''){
          values.push(String(v).trim());
        }
      }
    });

    return values;
  }

  function evaluateField($field, $form){
    var raw = $field.attr('data-show-if');
    if (!raw){
      $field.removeClass('ttpro-field-hidden');
      return;
    }

    var conditions = parseConditions(raw);
    if (!conditions.length){
      $field.removeClass('ttpro-field-hidden');
      return;
    }

    var visible = conditions.every(function(cond){
      if (!cond || !cond.id){
        return true;
      }
      var expected = [];
      if (Array.isArray(cond.value)){
        expected = cond.value.map(function(v){ return String(v); });
      } else if (cond.value !== undefined && cond.value !== null){
        expected = [String(cond.value)];
      }
      if (!expected.length){
        return false;
      }
      var actual = fieldValue($form, cond.id).map(function(v){ return String(v); });
      if (!actual.length){
        return false;
      }
      for (var i = 0; i < expected.length; i++){
        if (actual.indexOf(expected[i]) !== -1){
          return true;
        }
      }
      return false;
    });

    if (visible){
      $field.removeClass('ttpro-field-hidden');
    } else {
      $field.addClass('ttpro-field-hidden');
    }
  }

  function initForm($form){
    var $fields = $form.find('.ttpro-pdv-editor-field');

    function refresh(){
      $fields.each(function(){
        evaluateField($(this), $form);
      });
    }

    $form.on('change input', 'input, select, textarea', refresh);
    refresh();
  }

  $(function(){
    $('.ttpro-pdv-editor-form').each(function(){
      initForm($(this));
    });
  });
})(jQuery);
