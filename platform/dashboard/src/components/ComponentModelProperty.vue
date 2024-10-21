<template>
  <v-text-field
    v-if="view.type == 'text' && visible"
    type="text"
    :label="view.title"
    :value="
      textValue(value) ||
      (view.path ? textValue(model[view.path]) : textValue(view.value))
    "
    :hint="info"
    persistent-hint
    :readonly="mode == 'read'"
    :clearable="mode != 'read'"
    :error-messages="error"
    :prepend-icon="preAction.icon"
    :append-outer-icon="postAction.icon"
    @input="textChange"
    @click:prepend="action(preAction.name)"
    @click:append-outer="action(postAction.name)"
  ></v-text-field>

  <v-text-field
    v-else-if="view.type == 'number' && visible"
    type="number"
    :label="view.title"
    :value="
      textValue(value) ||
      (view.path ? textValue(model[view.path]) : textValue(view.value))
    "
    :hint="info"
    persistent-hint
    :readonly="mode == 'read'"
    :clearable="mode != 'read'"
    :error-messages="error"
    :prepend-inner-icon="preAction.icon"
    :append-outer-icon="postAction.icon"
    @input="textChange"
    @click:prepend-inner="action(preAction.name)"
    @click:append-outer="action(postAction.name)"
  ></v-text-field>

  <div v-else-if="view.type == 'range' && visible">
    <v-text-field
      type="number"
      :label="rangeMinLabel"
      :value="rangeMinValue"
      :hint="info"
      persistent-hint
      :readonly="mode == 'read'"
      :clearable="mode != 'read'"
      :error-messages="error"
      @input="rangeChange('min', $event)"
    ></v-text-field>

    <v-text-field
      type="number"
      :label="rangeMaxLabel"
      :value="rangeMaxValue"
      :hint="info"
      persistent-hint
      :readonly="mode == 'read'"
      :clearable="mode != 'read'"
      :error-messages="error"
      @input="rangeChange('max', $event)"
    ></v-text-field>
  </div>

  <v-checkbox
    v-else-if="view.type == 'check' && visible"
    :label="view.title"
    :input-value="view.path ? model[view.path] : view.value"
    :hint="info"
    persistent-hint
    :readonly="mode == 'read'"
    :error-messages="error"
    @change="change"
  ></v-checkbox>

  <v-select
    v-else-if="view.type == 'select' && visible"
    item-text="title"
    item-value="value"
    :items="selectValues"
    :label="view.title"
    :value="view.path ? model[view.path] : view.default"
    :hint="info"
    persistent-hint
    :readonly="mode == 'read'"
    :error-messages="error"
    :prepend-icon="preAction.icon"
    :append-outer-icon="postAction.icon"
    @input="selectChange"
    @click:prepend="action(preAction.name)"
    @click:append-outer="action(postAction.name)"
  ></v-select>
</template>

<script>
import _ from "lodash";
export default {
  name: "ComponentModelProperty",
  props: {
    view: { type: Object },
    model: { type: Object },
    value: { type: String },
  },
  data() {
    return {
      innerError: "",
    };
  },
  computed: {
    info() {
      return (
        (this.view.infoPath && this.model[this.view.infoPath]) || this.view.info
      );
    },
    error() {
      return (
        this.innerError ||
        (this.view.errorPath && this.model[this.view.errorPath]) ||
        this.view.error
      );
    },
    preAction() {
      return (
        (this.view.preActionPath &&
          this.model[this.view.preActionPath] && {
            icon: this.model[this.view.preActionPath].split(":")[0],
            name: this.model[this.view.preActionPath].split(":")[1],
          }) ||
        this.view.preAction ||
        {}
      );
    },
    postAction() {
      return (
        (this.view.postActionPath &&
          this.model[this.view.postActionPath] && {
            icon: this.model[this.view.postActionPath].split(":")[0],
            name: this.model[this.view.postActionPath].split(":")[1],
          }) ||
        this.view.postAction ||
        {}
      );
    },
    visible() {
      if (this.view.hasOwnProperty("visiblePath") && _.isBoolean(this.model[this.view.visiblePath]))
        return this.model[this.view.visiblePath];
      else if (this.view.hasOwnProperty("visible")) return this.view.visible;
      else return true;
    },
    mode() {
      return (
        (this.view.modePath && this.model[this.view.modePath]) || this.view.mode
      );
    },
    rangeMinLabel() {
      return (
        this.view.title.slice(1, this.view.title.indexOf(":")).trim() || "Min"
      );
    },
    rangeMaxLabel() {
      return (
        this.view.title
          .slice(this.view.title.indexOf(":") + 1, this.view.title.length - 1)
          .trim() || "Min"
      );
    },
    rangeMinValue() {
      let value = this.view.path ? this.model[this.view.path] : this.view.value;
      return value && Number(value.slice(1, value.indexOf(":")).trim()) || 0;
    },
    rangeMaxValue() {
      let value = this.view.path ? this.model[this.view.path] : this.view.value;
      return value && (
        Number(value.slice(value.indexOf(":") + 1, value.length - 1).trim()) ||
        100
      );
    },
    selectValues() {
      let selectValues = [], 
        currentValue = this.view.value || (this.view.path && this.model[this.view.path]);
      let found = false;
      for (let value of this.view.values) {
        if (!found) {
          if (value.pattern) {
            let re = new RegExp(value.pattern);
            if (re.test(currentValue)) {
              found = true;
              selectValues.push({title: value.title, value: currentValue});
            } else selectValues.push(value);
          } else {
            found = value.value == currentValue;
            selectValues.push(value);
          }
        } else selectValues.push(value);
      }
      this.$util.log(`[ComponentModelProperty] selectValues() = ${JSON.stringify(selectValues)}`)
      return selectValues;
    },
    /*selectValues() {
      if (
        this.view.path &&
        this.view.catchAll &&
        !this.view.values.find((v) => v.value == this.model[this.view.path])
      ) {
        let values = this.view.values.map((v) => {
          return v.value == this.view.catchAll
            ? { title: v.title, value: this.model[this.view.path] }
            : v;
        });
        this.$util.log(JSON.stringify(values));
        return values;
      } else return this.view.values;
    },*/
  },
  created() {},
  methods: {
    log(msg) {
      this.$util.log(msg);
    },
    textValue(value) {
      if (this.view.prepend) {
        if (value && value.startsWith(this.view.prepend))
          value = value.slice(this.view.prepend.length);
      }
      if (this.view.append) {
        if (value && value.endsWith(this.view.append))
          value = value.slice(0, -this.view.append.length);
      }
      return (value && value.trim()) || value;
    },
    action(name) {
      this.$util.log(`[ComponentModelProperty] action(${this.view.path},${name})`);
      this.$emit("change", {
        type: "action",
        path: this.view.path,
        value: name,
      });
    },
    change(value) {
      this.$util.log(
        `[ComponentModelProperty] change(${this.view.path},${value})`
      );
      this.$emit("change", {
        type: "update",
        path: this.view.path,
        value: value,
      });
    },
    selectChange(value) {
      this.$util.log(
        `[ComponentModelProperty] selectChange(${this.view.path},${value})`
      );
      this.$emit("change", {
        type: "update",
        path: this.view.path,
        value: value == this.view.catchAll ? this.view.default : value,
      });
    },
    textChange(value) {
      this.$util.log(
        `[ComponentModelProperty] textChange(${this.view.path},${value})`
      );
      value = value || "";
      if (this.view.prepend) value = this.view.prepend + value;
      if (this.view.append) value = value + this.view.append;
      if (this.view.validate) {
        let re = new RegExp(this.view.validate.pattern, "g");
        if (re.test((value && value.trim()) || value)) {
          this.innerError = "";
          this.$emit("change", {
            type: "update",
            path: this.view.path,
            value: value,
          });
        } else {
          this.innerError = this.view.validate.message || "Invalid value";
        }
      } else {
        this.$emit("change", {
          type: "update",
          path: this.view.path,
          value: (value && value.trim()) || value,
        });
      }
    },
    rangeChange(limit, value) {
      this.$util.log(
        `[ComponentModelProperty] rangeChange(${limit},${this.view.path},${value})`
      );
      let min = limit == "min" ? value : this.rangeMinValue;
      let max = limit == "max" ? value : this.rangeMaxValue;
      if (min > max) {
        this.innerError = "invalid range";
      } else {
        this.innerError = "";
        this.$emit("change", {
          type: "update",
          path: this.view.path,
          value: `[${min}:${max}]`,
        });
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
