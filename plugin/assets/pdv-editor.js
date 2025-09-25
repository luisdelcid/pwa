(function($){
  function toArray(value){
    if (Array.isArray(value)){
      return value;
    }
    if (value === undefined || value === null){
      return [];
    }
    return [value];
  }

  function normalizeValues(value){
    return toArray(value).map(function(item){
      if (item === undefined || item === null){
        return '';
      }
      return String(item).trim();
    });
  }

  function normalizeConditionValue(value){
    var raw = normalizeValues(value);
    var parts = [];

    raw.forEach(function(item){
      if (!item){
        return;
      }
      var needsSplit = item.indexOf('|') !== -1 || item.indexOf(',') !== -1;
      if (needsSplit){
        item.split(/[|,]/).forEach(function(piece){
          var trimmed = String(piece || '').trim();
          if (trimmed){
            parts.push(trimmed);
          }
        });
        return;
      }
      parts.push(item);
    });

    return parts.filter(function(item){
      return item !== '';
    });
  }

  var htmlDecodeEl = null;

  function decodeHtmlEntities(str){
    if (typeof str !== 'string'){ return str; }
    if (str.indexOf('&') === -1){ return str; }
    if (!htmlDecodeEl){
      htmlDecodeEl = document.createElement('textarea');
    }
    htmlDecodeEl.innerHTML = str;
    return htmlDecodeEl.value;
  }

  function parseConditions(raw){
    if (!raw){
      return [];
    }
    var text = String(raw);
    if (!text){
      return [];
    }
    var decoded = decodeHtmlEntities(text);
    try {
      var parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)){
        return parsed.map(function(item){
          if (!item || typeof item !== 'object'){
            return null;
          }
          var id = '';
          if (item.id !== undefined && item.id !== null){
            id = String(item.id);
          }
          var values = normalizeConditionValue(item.value);
          if (!id || !values.length){
            return null;
          }
          return { id: id, value: values };
        }).filter(Boolean);
      }
      if (parsed && typeof parsed === 'object'){
        var singleId = '';
        if (parsed.id !== undefined && parsed.id !== null){
          singleId = String(parsed.id);
        }
        var singleValues = normalizeConditionValue(parsed.value);
        if (!singleId || !singleValues.length){
          return [];
        }
        return [{ id: singleId, value: singleValues }];
      }
    } catch (e){
      try {
        if (decoded !== text){
          var reparsed = JSON.parse(text);
          if (Array.isArray(reparsed)){
            return reparsed.map(function(item){
              if (!item || typeof item !== 'object'){
                return null;
              }
              var rid = '';
              if (item.id !== undefined && item.id !== null){
                rid = String(item.id);
              }
              var rvalues = normalizeConditionValue(item.value);
              if (!rid || !rvalues.length){
                return null;
              }
              return { id: rid, value: rvalues };
            }).filter(Boolean);
          }
          if (reparsed && typeof reparsed === 'object'){
            var ridSingle = '';
            if (reparsed.id !== undefined && reparsed.id !== null){
              ridSingle = String(reparsed.id);
            }
            var rSingleValues = normalizeConditionValue(reparsed.value);
            if (!ridSingle || !rSingleValues.length){
              return [];
            }
            return [{ id: ridSingle, value: rSingleValues }];
          }
        }
      } catch (err){}
    }
    return [];
  }

  function shouldDisplayField(conditions, answers){
    var conds = Array.isArray(conditions) ? conditions : [conditions];
    if (!conds.length){
      return true;
    }
    return conds.every(function(cond){
      if (!cond || !cond.id){
        return true;
      }
      var expectedValues = normalizeConditionValue(cond.value);
      if (expectedValues.length === 0){
        return false;
      }
      var actualValues = normalizeValues(answers[cond.id]);
      if (actualValues.length === 0){
        return false;
      }
      return expectedValues.some(function(expected){
        return actualValues.indexOf(expected) !== -1;
      });
    });
  }

  function readFieldAnswer($field){
    var type = ($field.attr('data-field-type') || '').toLowerCase();
    var fieldId = String($field.attr('data-field-id') || '');

    if (type === 'checkbox'){
      var values = [];
      $field.find('input[type="checkbox"]').each(function(){
        var $el = $(this);
        if ($el.prop('checked')){
          var val = $el.val();
          if (val !== undefined && val !== null){
            values.push(String(val).trim());
          }
        }
      });
      return values;
    }

    if (type === 'radio' || type === 'post'){
      var $checked = $field.find('input[type="radio"]:checked').first();
      if ($checked.length){
        var radioVal = $checked.val();
        if (radioVal !== undefined && radioVal !== null){
          return String(radioVal).trim();
        }
      }
      return '';
    }


    if (type === 'geo'){
      var lat = String(($field.find('[name$="[lat]"]').val() || '')).trim();
      var lng = String(($field.find('[name$="[lng]"]').val() || '')).trim();
      var acc = String(($field.find('[name$="[accuracy]"]').val() || '')).trim();
      if (!lat && !lng && !acc){
        return '';
      }
      var payload = {};
      if (lat){ payload.lat = lat; }
      if (lng){ payload.lng = lng; }
      if (acc){ payload.accuracy = acc; }
      return payload;
    }

    if (type === 'photo'){
      var fileInput = $field.find('input[type="file"]').get(0);
      if (fileInput && fileInput.files && fileInput.files.length){
        return '1';
      }
      var hasExisting = String($field.find('[name^="ttpro_existing_photo[' + fieldId + ']"]').val() || '') === '1';
      var removeChecked = $field.find('[name^="ttpro_remove_photo[' + fieldId + ']"]').filter(':checked').length > 0;
      return hasExisting && !removeChecked ? '1' : '';
    }

    var $select = $field.find('select');
    if ($select.length){
      var selectVal = $select.val();
      if (Array.isArray(selectVal)){
        return selectVal.map(function(v){
          if (v === undefined || v === null){
            return '';
          }
          return String(v).trim();
        });
      }
      if (selectVal === undefined || selectVal === null){
        return '';
      }
      return String(selectVal).trim();
    }

    var $textarea = $field.find('textarea');
    if ($textarea.length){
      var taVal = $textarea.first().val();
      if (taVal === undefined || taVal === null){
        return '';
      }
      return String(taVal).trim();
    }

    var $input = $field.find('input').filter(function(){
      var $el = $(this);
      var typeAttr = ($el.attr('type') || '').toLowerCase();
      if (typeAttr === 'radio' || typeAttr === 'checkbox' || typeAttr === 'hidden' || typeAttr === 'file'){
        return false;
      }
      if ($el.is('[name^="ttpro_existing_photo"], [name^="ttpro_remove_photo"]')){
        return false;
      }
      return true;
    }).first();

    if ($input.length){
      var inputVal = $input.val();
      if (inputVal === undefined || inputVal === null){
        return '';
      }
      return String(inputVal).trim();
    }

    return '';
  }

  function collectAnswers($fields){
    var answers = {};
    $fields.each(function(){
      var $field = $(this);
      var fieldId = String($field.attr('data-field-id') || '');
      if (!fieldId){
        return;
      }
      answers[fieldId] = readFieldAnswer($field);
    });
    return answers;
  }

  function getConditionsForField($field){
    if ($field.data('ttproShowIfParsed') !== undefined){
      return $field.data('ttproShowIfParsed');
    }
    var raw = $field.attr('data-show-if');
    if (!raw){
      $field.data('ttproShowIfParsed', null);
      return null;
    }
    var parsed = parseConditions(raw);
    if (!parsed.length){
      $field.data('ttproShowIfParsed', null);
      return null;
    }
    if (parsed.length === 1){
      $field.data('ttproShowIfParsed', parsed[0]);
      return parsed[0];
    }
    $field.data('ttproShowIfParsed', parsed);
    return parsed;
  }

  function setFieldVisibility($field, visible){
    if (visible){
      $field.removeClass('ttpro-field-hidden').attr('aria-hidden', 'false');
    } else {
      $field.addClass('ttpro-field-hidden').attr('aria-hidden', 'true');
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

    var state = { step: 0, answers: {} };

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

    function applyConditions(answers){

      $fields.each(function(){
        var $field = $(this);
        var conditions = getConditionsForField($field);
        if (!conditions){
          setFieldVisibility($field, true);
          return;
        }
        var visible = shouldDisplayField(conditions, answers);
        setFieldVisibility($field, visible);
      });
    }

    function refresh(){
      var answers = collectAnswers($fields);
      state.answers = answers;
      applyConditions(answers);

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
      refresh();

    });

    $prevBtn.on('click', function(e){
      e.preventDefault();
      if (state.step > 0){
        state.step -= 1;
        refresh();

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
