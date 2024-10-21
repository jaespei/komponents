<template>
  
  <v-expansion-panels v-if="endpoints.length">
    <v-expansion-panel v-for="endpoint in endpoints" :key="endpoint.name">
      <v-expansion-panel-header>
        {{ endpoint.name.toUpperCase() }}
      </v-expansion-panel-header>
      <v-expansion-panel-content>
        <v-text-field
          label="Type"
          dense
          outlined
          readonly
          :value="endpoint.type == 'in'? 'Input': 'Output'"
        ></v-text-field>
        <v-text-field
          label="Protocol"
          dense
          outlined
          readonly
          :value="endpoint.protocol"
        ></v-text-field>
        <v-text-field
          label="Required"
          dense
          outlined
          readonly
          :value="endpoint.required? 'Yes': 'No'"
        ></v-text-field>
        <v-toolbar v-if="myMode == 'write'" flat short dense height="30">
          <v-spacer></v-spacer>
          
          <v-btn
            small
            v-if="endpoint.name == editing"
            icon
            plain
            @click="editing = ''"
            ><v-icon medium>mdi-pencil-off</v-icon></v-btn
          >
          <v-btn small v-else icon plain @click="editing = endpoint.name"
            ><v-icon medium>mdi-pencil</v-icon></v-btn
          >
        </v-toolbar>
        <tiptap-vuetify
          style="margin-top: 11px"
          v-if="endpoint.name == editing"
          :value="endpoint.desc"
          :extensions="extensions"
          @input="changeEndpoint(endpoint, $event)"
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
            <div style="padding: 10px" v-html="endpoint.desc"></div>
          </fieldset>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
  <v-subheader v-else>No endpoints</v-subheader>

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
  name: "ComponentEndpoints",
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
    endpoints() {
      return _.map(this.component.model.endpoints, (ep, epName) => {
          return { 
              name: epName, 
              type: ep.type,
              protocol: ep.protocol,
              required: ep.required || false,
              desc: this.desc.endpoints[epName] || ""
            };
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
            volumes: desc.volumes || {}
        };
      } catch (err) {
        return template;
      }
    },
  },
  methods: {
    changeEndpoint(endpoint, ev) {
      let desc = this.desc;
      desc.endpoints[endpoint.name] = ev;
      this.$emit("change", { desc: JSON.stringify(desc) });
    },
   
  },
};
</script>
<style scoped>
</style>