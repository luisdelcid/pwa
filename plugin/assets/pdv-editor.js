(function ($) {
  'use strict';

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  }

  function normalizeValues(value) {
    return toArray(value).map(function (item) {
      if (item === undefined || item === null) return '';
      return String(item).trim();
    });
  }

  var htmlDecodeEl = null;

  function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;
    if (str.indexOf('&') === -1) return str;
    if (!htmlDecodeEl) {
      htmlDecodeEl = document.createElement('textarea');
    }
    htmlDecodeEl.innerHTML = str;
    return htmlDecodeEl.value;
  }

  function parseShowIf($field) {
    var cached = $field.data('ttproShowIfCache');
    if (cached !== undefined) return cached;

    var raw = $field.attr('data-show-if');
    if (!raw) {
      $field.data('ttproShowIfCache', null);
      return null;
    }

    var text = decodeHtmlEntities(String(raw));
    var parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch (err) {
      parsed = null;
    }

    function normalizeCondition(cond) {
      if (!cond || typeof cond !== 'object') return null;
      var id = '';
      if (cond.id !== undefined && cond.id !== null) {
        id = String(cond.id);
      }
      if (!id) return null;
      var values = normalizeValues(cond.value);
      if (!values.length) return null;
      return { id: id, value: values };
    }

    var result = null;

    if (Array.isArray(parsed)) {
      result = parsed.map(normalizeCondition).filter(Boolean);
      if (!result.length) result = null;
    } else {
      var single = normalizeCondition(parsed);
      result = single ? [single] : null;
    }

    $field.data('ttproShowIfCache', result);
    return result;
  }

  function shouldShowField($field, answers) {
    var conditions = parseShowIf($field);
    if (!conditions || !conditions.length) return true;

    return conditions.every(function (cond) {
      if (!cond || !cond.id) return true;
      var actualValues = normalizeValues(answers[cond.id]);
      if (!actualValues.length) return false;
      var expectedValues = normalizeValues(cond.value);
      if (!expectedValues.length) return false;
      for (var i = 0; i < expectedValues.length; i++) {
        if (actualValues.indexOf(expectedValues[i]) !== -1) {
          return true;
        }
      }
      return false;
    });
  }

  function readAnswer($field) {
    var type = ($field.attr('data-field-type') || '').toLowerCase();

    if (type === 'checkbox') {
      var values = [];
      $field.find('input[type="checkbox"]').each(function () {
        var $el = $(this);
        if ($el.prop('checked')) {
          var val = $el.val();
          if (val !== undefined && val !== null) {
            values.push(String(val).trim());
          }
        }
      });
      return values;
    }

    if (type === 'radio' || type === 'post') {
      var $checked = $field.find('input[type="radio"]:checked').first();
      if ($checked.length) {
        var radioVal = $checked.val();
        if (radioVal !== undefined && radioVal !== null) {
          return String(radioVal).trim();
        }
      }
      return '';
    }

    if (type === 'photo') {
      var fileInput = $field.find('input[type="file"]').get(0);
      if (fileInput && fileInput.files && fileInput.files.length) {
        return '1';
      }
      var fieldId = String($field.attr('data-field-id') || '');
      var hasExisting = String($field.find('[name^="ttpro_existing_photo[' + fieldId + ']"]').val() || '') === '1';
      var removeChecked = $field
        .find('[name^="ttpro_remove_photo[' + fieldId + ']"]')
        .filter(':checked')
        .length > 0;
      return hasExisting && !removeChecked ? '1' : '';
    }

    if (type === 'geo') {
      var lat = String(($field.find('[name$="[lat]"]').val() || '')).trim();
      var lng = String(($field.find('[name$="[lng]"]').val() || '')).trim();
      var accuracy = String(($field.find('[name$="[accuracy]"]').val() || '')).trim();
      if (!lat && !lng && !accuracy) {
        return '';
      }
      var payload = {};
      if (lat) payload.lat = lat;
      if (lng) payload.lng = lng;
      if (accuracy) payload.accuracy = accuracy;
      return payload;
    }

    var $select = $field.find('select').first();
    if ($select.length) {
      var selectVal = $select.val();
      if (Array.isArray(selectVal)) {
        return selectVal.map(function (item) {
          if (item === undefined || item === null) return '';
          return String(item).trim();
        });
      }
      if (selectVal === undefined || selectVal === null) {
        return '';
      }
      return String(selectVal).trim();
    }

    var $textarea = $field.find('textarea').first();
    if ($textarea.length) {
      var taVal = $textarea.val();
      if (taVal === undefined || taVal === null) return '';
      return String(taVal).trim();
    }

    var $input = $field
      .find('input')
      .filter(function () {
        var $el = $(this);
        var typeAttr = ($el.attr('type') || '').toLowerCase();
        if (typeAttr === 'radio' || typeAttr === 'checkbox' || typeAttr === 'hidden' || typeAttr === 'file') {
          return false;
        }
        if ($el.is('[name^="ttpro_existing_photo"], [name^="ttpro_remove_photo"]')) {
          return false;
        }
        return true;
      })
      .first();

    if ($input.length) {
      var inputVal = $input.val();
      if (inputVal === undefined || inputVal === null) return '';
      return String(inputVal).trim();
    }

    return '';
  }

  function collectAnswers($fields) {
    var answers = {};
    $fields.each(function () {
      var $field = $(this);
      var fieldId = String($field.attr('data-field-id') || '');
      if (!fieldId) return;
      answers[fieldId] = readAnswer($field);
    });
    return answers;
  }

  function setFieldVisibility($field, visible) {
    if (visible) {
      $field.removeClass('ttpro-field-hidden').attr('aria-hidden', 'false');
    } else {
      $field.addClass('ttpro-field-hidden').attr('aria-hidden', 'true');
    }
  }

  function isFieldRequired($field) {
    return String($field.attr('data-required') || '') === '1';
  }

  function hasValue($field, answers) {
    if (!$field || !$field.length) return true;
    if ($field.hasClass('ttpro-field-hidden')) return true;

    var fieldId = String($field.attr('data-field-id') || '');
    if (!fieldId) return true;

    var type = ($field.attr('data-field-type') || '').toLowerCase();
    var value = answers[fieldId];

    if (type === 'checkbox') {
      return Array.isArray(value) && value.length > 0;
    }
    if (type === 'radio' || type === 'post') {
      return typeof value === 'string' && value.trim() !== '';
    }
    if (type === 'photo') {
      return value === '1';
    }
    if (type === 'geo') {
      return value && value.lat && value.lng;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).length > 0;
    }
    if (typeof value === 'string') {
      return value.trim() !== '';
    }
    return value !== undefined && value !== null && value !== '';
  }

  function focusField($field) {
    if (!$field || !$field.length) return;
    setTimeout(function () {
      var $focusable = $field
        .find('input:not([type="hidden"]), textarea, select, button')
        .filter(function () {
          var $el = $(this);
          if ($el.is(':disabled')) return false;
          if ($el.is('input[type="radio"], input[type="checkbox"]')) {
            return $el.is(':visible');
          }
          return $el.is(':visible');
        })
        .first();
      if ($focusable.length) {
        $focusable.trigger('focus');
      }
    }, 30);
  }

  function initForm($form) {
    var $fields = $form.find('.ttpro-pdv-editor-field');
    if (!$fields.length) return;

    var $stepIndicator = $form.find('.ttpro-step-indicator');
    var $progressBar = $form.find('.ttpro-step-progress-bar');
    var $progress = $form.find('.ttpro-step-progress');
    var $nextBtn = $form.find('.ttpro-step-next');
    var $prevBtn = $form.find('.ttpro-step-prev');

    var defaultNextLabel = $nextBtn.data('default-label') || $nextBtn.text();
    var finalNextLabel = $nextBtn.data('final-label') || $nextBtn.text();

    var state = {
      step: 0,
      answers: collectAnswers($fields)
    };

    function getVisibleFields() {
      return $fields.filter(function () {
        return !$(this).hasClass('ttpro-field-hidden');
      });
    }

    function applyConditions() {
      $fields.each(function () {
        var $field = $(this);
        var visible = shouldShowField($field, state.answers);
        setFieldVisibility($field, visible);
      });
    }

    function clampStep() {
      var $visible = getVisibleFields();
      var total = $visible.length;
      if (!total) {
        state.step = 0;
        return;
      }
      if (state.step >= total) {
        state.step = total - 1;
      }
      if (state.step < 0) {
        state.step = 0;
      }
    }

    function updateUI() {
      var $visible = getVisibleFields();
      var total = $visible.length;

      $fields.removeClass('ttpro-step-active ttpro-step-hidden-step');

      if (!total) {
        $fields.addClass('ttpro-step-hidden-step');
        $stepIndicator.text('0/0');
        $progressBar.css('width', '0%');
        if ($progress.length) {
          $progress.attr('aria-valuenow', 0);
        }
        $nextBtn.prop('disabled', true);
        $prevBtn.prop('disabled', true);
        return;
      }

      $fields.addClass('ttpro-step-hidden-step');

      var $current = $visible.eq(state.step);
      if ($current.length) {
        $current.removeClass('ttpro-step-hidden-step').addClass('ttpro-step-active');
      }

      var isLast = state.step === total - 1;
      var pct = total > 1 ? Math.round((state.step / (total - 1)) * 100) : 100;
      if (!isFinite(pct)) pct = 0;

      $stepIndicator.text((state.step + 1) + '/' + total);
      $progressBar.css('width', pct + '%');
      if ($progress.length) {
        $progress.attr('aria-valuenow', pct);
      }
      $nextBtn.text(isLast ? finalNextLabel : defaultNextLabel);
      $prevBtn.prop('disabled', state.step === 0);

      var required = $current.length && isFieldRequired($current);
      if (required) {
        $nextBtn.prop('disabled', !hasValue($current, state.answers));
      } else {
        $nextBtn.prop('disabled', false);
      }

      focusField($current);
    }

    function refresh() {
      state.answers = collectAnswers($fields);
      applyConditions();
      clampStep();
      updateUI();
    }

    $form.on('change ttpro:refresh input', 'input, select, textarea', function () {
      refresh();
    });

    $nextBtn.on('click', function (event) {
      event.preventDefault();
      if ($nextBtn.prop('disabled')) return;

      var $visible = getVisibleFields();
      if (!$visible.length) return;

      var $current = $visible.eq(state.step);
      var required = $current.length && isFieldRequired($current);
      if (required && !hasValue($current, state.answers)) {
        focusField($current);
        return;
      }

      if (state.step >= $visible.length - 1) {
        var formEl = $form.get(0);
        if (formEl) {
          if (typeof formEl.requestSubmit === 'function') {
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

    $prevBtn.on('click', function (event) {
      event.preventDefault();
      if (state.step > 0) {
        state.step -= 1;
        refresh();
      }
    });

    refresh();
  }

  $(function () {
    $('.ttpro-pdv-editor-form').each(function () {
      initForm($(this));
    });
  });
})(jQuery);
