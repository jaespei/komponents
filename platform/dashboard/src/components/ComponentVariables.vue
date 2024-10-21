<template>
  <v-expansion-panels v-if="variables.length">
    <v-expansion-panel v-for="variable in variables" :key="variable.name">
      <v-expansion-panel-header>
        {{ variable.name.toUpperCase() }}
      </v-expansion-panel-header>
      <v-expansion-panel-content>
        <v-text-field
          label="Value"
          dense
          outlined
          readonly
          v-model="variable.value"
        ></v-text-field>
        <v-toolbar v-if="myMode == 'write'" flat short dense height="30">
          <v-spacer></v-spacer>

          <v-btn
            small
            v-if="variable.name == editing"
            icon
            plain
            @click="editing = ''"
            ><v-icon medium>mdi-pencil-off</v-icon></v-btn
          >
          <v-btn small v-else icon plain @click="editing = variable.name"
            ><v-icon medium>mdi-pencil</v-icon></v-btn
          >
        </v-toolbar>
        <tiptap-vuetify
          style="margin-top: 11px"
          v-if="variable.name == editing"
          :value="variable.desc"
          :extensions="extensions"
          @input="changeVariable(variable, $event)"
        />

        <div v-else>
          <fieldset
            style="
              border-color: rgba(0, 0, 0, 0.38);
              border-width: 1px;
              border-radius: 4px;
              min-height: 100px;
            "
          >
            <legend>
              <span>&ZeroWidthSpace;</span>
              <span
                style="
                  font-size: 13px;
                  color: rgba(0, 0, 0, 0.68);
                  position: absolute;
                  left: 30px;
                  background-color: white;
                  padding: 0px 5px;
                "
                >Description</span
              >
            </legend>
            <div style="padding: 10px" v-html="variable.desc"></div>
          </fieldset>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
  <v-subheader v-else>No variables</v-subheader>
</template>
<script>
import _ from "lodash";
import {
  TiptapVuetify,
  Heading,
  Bold,
  Italic,
  Strike,
  Underline,
  Code,
  Paragraph,
  BulletList,
  OrderedList,
  ListItem,
  Link,
  Blockquote,
  HardBreak,
  HorizontalRule,
  History,
} from "tiptap-vuetify";

export default {
  name: "ComponentVariables",
  components: { TiptapVuetify },
  props: {
    component: {
      type: Object,
      required: true,
    },
    mode: {
      type: String,
    },
  },
  data() {
    return {
      editing: "",

      // declare extensions you want to use
      extensions: [
        History,
        Blockquote,
        Link,
        Underline,
        Strike,
        Italic,
        ListItem,
        BulletList,
        OrderedList,
        [
          Heading,
          {
            options: {
              levels: [1, 2, 3],
            },
          },
        ],
        Bold,
        Code,
        HorizontalRule,
        Paragraph,
        HardBreak,
      ],
    };
  },
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      let perms = _.filter(this.component.perms, (perm) =>
        this.$root.user.roles.includes(perm.role)
      );
      if (_.find(perms, (perm) => perm.type == "write" || perm.type == "owner"))
        return "write";
      else return "read";
    },
    variables() {
      return _.map(this.component.model.variables, (varValue, varName) => {
        return {
            name: varName,
            value: varValue || "",
            desc: this.desc.variables[varName] || "",
          };
        /*if (_.isString(varValue)) {
          return {
            name: varName,
            value: varValue || "",
            desc: this.desc.variables[varName] || "",
          };
        } else {
          return {
            name: varValue[`@name`],
            value: varValue.value || "",
            desc: this.desc.variables[varValue[`@name`]] || "",
          };
        }*/
      });
    },
    desc() {
      let template = {
        desc: "",
        variables: {},
        endpoints: {},
        volumes: {},
      };
      if (!this.component.desc) return template;
      try {
        let desc = JSON.parse(this.component.desc);
        return {
          desc: desc.desc || "",
          variables: desc.variables || {},
          endpoints: desc.endpoints || {},
          volumes: desc.volumes || {},
        };
      } catch (err) {
        return template;
      }
    },
  },
  methods: {
    refresh() {},
    changeVariable(variable, ev) {
      //console.dir(`${variable.name}=${ev}`);
      let desc = this.desc;
      desc.variables[variable.name] = ev;
      this.$emit("change", { desc: JSON.stringify(desc) });
    },
  },
};
</script>
<style scoped>
</style>