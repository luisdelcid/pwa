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
    var selector = '[name^="ttpro_answers[' + fieldId + ']"], [name^="ttpro_geo[' + fieldId + ']"], [name^="ttpro_photo[' + fieldId + ']"]';
    var $inputs = $form.find(selector);
    var values = [];

    if ($inputs.length){
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
    }

    var $field = $form.find('.ttpro-pdv-editor-field[data-field-id="' + fieldId + '"]');
    if ($field.length){
      var typeAttr = ($field.attr('data-field-type') || '').toLowerCase();
      if (typeAttr === 'photo'){
        var $remove = $field.find('[name^="ttpro_remove_photo[' + fieldId + ']"]');
        if ($remove.filter(':checked').length){
          return [];
        }
        var $existing = $field.find('[name^="ttpro_existing_photo[' + fieldId + ']"]');
        if ($existing.length && String($existing.val()) === '1'){
          values.push('existing');
        }
      }
    }

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

  function isFieldValid($field){
    if (!$field || !$field.length){
      return true;
    }
    if ($field.hasClass('ttpro-field-hidden')){
      return true;
    }

    var required = String($field.attr('data-required') || '') === '1';
    if (!required){
      return true;
    }

    var type = ($field.attr('data-field-type') || '').toLowerCase();

    if (type === 'checkbox'){
      return $field.find('input[type="checkbox"]:checked').length > 0;
    }
    if (type === 'radio' || type === 'post'){
      return $field.find('input[type="radio"]:checked').length > 0;
    }
    if (type === 'geo'){
      var lat = $field.find('[name$="[lat]"]').val();
      var lng = $field.find('[name$="[lng]"]').val();
      return !!(lat && String(lat).trim() !== '' && lng && String(lng).trim() !== '');
    }
    if (type === 'photo'){
      var fileInput = $field.find('input[type="file"]').get(0);
      var hasFile = !!(fileInput && fileInput.files && fileInput.files.length);
      if (hasFile){
        return true;
      }
      var hasExisting = String($field.find('[name^="ttpro_existing_photo"]').val() || '') === '1';
      var removeChecked = $field.find('[name^="ttpro_remove_photo"]').filter(':checked').length > 0;
      return hasExisting && !removeChecked;
    }

    var $controls = $field.find('input:not([type="hidden"]), textarea, select');
    if (!$controls.length){
      return true;
    }

    var valid = true;
    $controls.each(function(){
      if (!valid){
        return false;
      }
      var $el = $(this);
      if ($el.is(':hidden') && !$el.is('select')){
        return true;
      }
      var val = $el.val();
      if (val === null || val === undefined || String(val).trim() === ''){
        valid = false;
      }
    });

    return valid;
  }

  function initForm($form){
    var $fields = $form.find('.ttpro-pdv-editor-field');
    if (!$fields.length){
      return;
    }

    var state = { step: 0 };
    var $stepIndicator = $form.find('.ttpro-step-indicator');
    var $progressBar = $form.find('.ttpro-step-progress-bar');
    var $progress = $form.find('.ttpro-step-progress');
    var $nextBtn = $form.find('.ttpro-step-next');
    var $prevBtn = $form.find('.ttpro-step-prev');

    var defaultNextLabel = $nextBtn.data('default-label') || $nextBtn.text();
    var finalNextLabel = $nextBtn.data('final-label') || defaultNextLabel;

    function getVisibleFields(){
      return $fields.filter(function(){
        return !$(this).hasClass('ttpro-field-hidden');
      });
    }

    function clampStep(){
      var total = getVisibleFields().length;
      if (!total){
        state.step = 0;
        return;
      }
      if (state.step >= total){
        state.step = total - 1;
      }
      if (state.step < 0){
        state.step = 0;
      }
    }

    function focusCurrent($current){
      if (!$current || !$current.length){
        return;
      }
      setTimeout(function(){
        var $focusable = $current.find('input:not([type="hidden"]), textarea, select').filter(function(){
          var $el = $(this);
          if ($el.is(':disabled')){
            return false;
          }
          if ($el.is('input[type="radio"], input[type="checkbox"]')){
            return $el.is(':visible');
          }
          return $el.is(':visible');
        }).first();
        if ($focusable.length){
          $focusable.trigger('focus');
        }
      }, 10);
    }

    function updateUI(){
      clampStep();
      var $visible = getVisibleFields();
      var total = $visible.length;

      $fields.removeClass('ttpro-step-active ttpro-step-hidden-step');

      if (!total){
        $stepIndicator.text('0/0');
        $progressBar.css('width', '0%');
        $progress.attr('aria-valuenow', 0);
        $nextBtn.prop('disabled', true);
        $prevBtn.prop('disabled', true);
        return;
      }

      var $current = $visible.eq(state.step);
      $visible.addClass('ttpro-step-hidden-step');
      if ($current.length){
        $current.removeClass('ttpro-step-hidden-step').addClass('ttpro-step-active');
      }

      var isLast = state.step === total - 1;
      var pct = total > 1 ? Math.round((state.step / (total - 1)) * 100) : 100;
      if (!isFinite(pct)){
        pct = 0;
      }

      $stepIndicator.text((state.step + 1) + '/' + total);
      $progressBar.css('width', pct + '%');
      $progress.attr('aria-valuenow', pct);
      $nextBtn.text(isLast ? finalNextLabel : defaultNextLabel);
      $prevBtn.prop('disabled', state.step === 0);

      var canAdvance = isFieldValid($current);
      $nextBtn.prop('disabled', !canAdvance);

      focusCurrent($current);
    }

    function applyConditions(){
      $fields.each(function(){
        evaluateField($(this), $form);
      });
    }

    function refresh(){
      applyConditions();
      updateUI();
    }

    $form.on('change input', 'input, select, textarea', function(){
      refresh();
    });

    $nextBtn.on('click', function(e){
      e.preventDefault();
      var $visible = getVisibleFields();
      if (!$visible.length){
        return;
      }
      var $current = $visible.eq(state.step);
      if (!isFieldValid($current)){
        focusCurrent($current);
        return;
      }
      var isLast = state.step >= ($visible.length - 1);
      if (isLast){
        var formEl = $form.get(0);
        if (formEl){
          if (typeof formEl.requestSubmit === 'function'){
            formEl.requestSubmit();
          } else {
            formEl.submit();
          }
        }
        return;
      }
      state.step += 1;
      updateUI();
    });

    $prevBtn.on('click', function(e){
      e.preventDefault();
      if (state.step > 0){
        state.step -= 1;
        updateUI();
      }
    });

    refresh();
  }

  $(function(){
    $('.ttpro-pdv-editor-form').each(function(){
      initForm($(this));
    });
  });
})(jQuery);
