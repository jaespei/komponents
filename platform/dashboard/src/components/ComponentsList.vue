<template>
  <div class="components-list" style="height: 100%; overflow-y: auto">
    <v-container fluid>
      <v-row no-gutters>
        <v-col cols="12">
          <v-toolbar flat dense>
            <v-text-field
              v-model="filterText"
              prepend-icon="mdi-magnify"
              label="Search"
              clearable
              class="mx-4"
              @change="appendFilter(filterText)"
            ></v-text-field>
            <v-spacer></v-spacer>
            <v-btn
              v-if="mode == 'list'"
              color="primary"
              dark
              rounded
              @click="openAddComponent"
              >Add component</v-btn
            >
          </v-toolbar>
        </v-col>
        <v-col cols="12">
          <v-row>
            <v-col cols="auto">
              <v-chip-group
                column
                multiple
                mandatory
                v-model="selectedFixedFilters"
                @change="refresh"
              >
                <v-chip
                  filter
                  v-for="f in fixedFilters"
                  :key="f.label"
                  :value="f.value"
                >
                  {{ f.label }}
                </v-chip>
              </v-chip-group>
            </v-col>
            <v-col cols="auto">
              <v-chip-group column multiple v-model="selectedFilters">
                <v-chip
                  filter
                  close
                  v-for="f in filters"
                  :key="f.label"
                  :value="f.value"
                  @click:close="removeFilter(f)"
                  @change="refresh"
                >
                  {{ f.label }}
                </v-chip>
              </v-chip-group>
            </v-col>
          </v-row>
        </v-col>
      </v-row>

      <v-data-table
        :headers="myHeaders"
        :items="components"
        :items-per-page="5"
        :single-select="mode == 'select'"
        :show-select="mode == 'select'"
        @click:row="showComponent"
        @item-selected="selectComponent"
        @click.native="clickComponent"
      >
        <template v-slot:item.tags="{ item }">
          <v-chip-group mandatory>
            <v-chip
              v-for="tag in tags(item)"
              :key="`${item.id}-${tag.id}`"
              :color="tag.color"
              text-color="black"
            >
              {{ tag.text }}
            </v-chip>
          </v-chip-group>
        </template>

        <template v-slot:item.owner="{ item }">
          <v-chip
            v-if="users[item.owner]"
            pill
            color="lightgrey"
            @click.stop="selectUser($event, users[item.owner])"
          >
            <v-avatar v-if="users[item.owner].pict" left>
              <img :src="users[item.owner].pict" />
            </v-avatar>
            <span>{{ users[item.owner].name }}</span>
          </v-chip>
          <v-progress-circular v-else indeterminate></v-progress-circular>
        </template>

        <template v-if="mode == 'list'" v-slot:item.actions="{ item }">
          <v-btn v-if="item.perm" icon outlined>
            <v-icon @click.stop="openEditComponent(item)">
              {{ item.perm == "read" ? "mdi-magnify" : "mdi-pencil" }}
            </v-icon> </v-btn
          >&nbsp;
          <v-btn v-if="item.perm == 'owner'" icon outlined>
            <v-icon @click.stop="openRemoveComponent(item)"
              >mdi-delete</v-icon
            > </v-btn
          >&nbsp;
          <v-btn icon outlined>
            <v-icon @click.stop="exportComponent(item)">mdi-download</v-icon>
          </v-btn>
          &nbsp;
          <v-btn v-if="appMode == 'dashboard'" icon outlined>
            <v-icon @click.stop="openDeployComponent(item)">mdi-play</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-container>

    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="64"></v-progress-circular>
    </v-overlay>

    <v-menu
      v-model="showUserProfile"
      :close-on-content-click="false"
      :position-x="userProfilePosition.x"
      :position-y="userProfilePosition.y"
      absolute
      offset-y
    >
      <user-profile
        :user="selectedUser"
        :width="300"
        @close="showUserProfile = false"
      ></user-profile>
    </v-menu>

    <v-dialog v-model="addingComponent" persistent scrollable max-width="600px">
      <v-card>
        <v-card-title>
          <!--span class="text-h5">Add Component</span-->
          <v-tabs icons-and-text v-model="addComponentMode" @change="resetAddComponent">
              <v-tab key="new">New component<v-icon>mdi-plus</v-icon></v-tab>
              <v-tab key="import">Import component<v-icon>mdi-upload</v-icon></v-tab>
            </v-tabs>
        </v-card-title>
        <v-card-text>
          <v-container>            
            <v-tabs-items v-model="addComponentMode">
              <v-tab-item key="new">
                <v-form ref="addComponentForm" v-model="addComponentValid">
                  <v-row>
                    <v-col cols="12">
                      <v-select
                        :items="componentTypes"
                        label="Type*"
                        :rules="[rules.required]"
                        required
                        v-model="addComponent.type"
                        @change="resetAddComponent(false)"
                      ></v-select>
                    </v-col>
                    <v-col cols="12">
                      <v-text-field
                        label="Title*"
                        :rules="[rules.required]"
                        required
                        v-model="addComponent.title"
                      ></v-text-field>
                    </v-col>
                  </v-row>
                </v-form>
              </v-tab-item>       
              <v-tab-item key="import">
                <v-form ref="importComponentForm" v-model="importComponentValid">
                  <v-row>
                    <v-col cols="12">
                      <v-file-input
                        ref="fileImport"
                        chips         
                        :rules="[checkFileToImport]"
                        required
                        v-model="importComponent.file"               
                        label="File*"
                        accept="text/*,.json,.yaml,.component,.model"
                        @change="changeFileToImport"
                      ></v-file-input>
                    </v-col>
                    <v-col cols="12">
                      <v-text-field
                        label="Title*"
                        :rules="[rules.required]"
                        required
                        v-model="importComponent.title"
                      ></v-text-field>
                    </v-col>
                  </v-row>
                </v-form>
              </v-tab-item>     
            </v-tabs-items>
          </v-container>
          <small>*Required field</small>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue darken-1" text @click="cancelAddComponent">
            Cancel
          </v-btn>
          <v-btn
            :disabled="!addComponentValid && !importComponentValid"
            color="blue darken-1"
            text
            @click="acceptAddComponent"
          >
            Accept
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="confirmRemove" max-width="300">
      <v-card>
        <v-card-title class="text-h5"> Remove </v-card-title>
        <v-card-text>
          <p>Are you sure you want to remove the component?</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="confirmRemove = false">
            No
          </v-btn>
          <v-btn color="primary" text @click="acceptRemoveComponent">
            Yes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-menu
      v-model="showComponentDetails"
      :close-on-content-click="false"
      :position-x="componentDetailsPosition.x"
      :position-y="componentDetailsPosition.y"
      absolute
      offset-y
    >
      <v-card>
        <v-card-text>
          <component-basic
            mode="read"
            :component="selectedComponent"
          ></component-basic>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="showComponentDetails=false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>
  </div>
</template>

<script>
import _ from "lodash";
import ComponentBasic from "./ComponentBasic";
import UserProfile from "./UserProfile";
import YAML from 'yaml';

export default {
  name: "ComponentsList",
  components: {
    ComponentBasic,
    UserProfile,
  },
  props: {
    mode: {
      type: String,
      default: "list",
    },
    type: {
      type: String
    }
  },
  data() {
    let data = {
      appMode: this.$appMode,
      fixedFilters: [
        { label: "Composite", value: "type=composite" },
        { label: "Basic", value: "type=basic" },
      ],
      selectedFixedFilters: ["type=composite", "type=basic"],
      filters: [],
      selectedFilters: [],
      filterText: "",
      loading: false,
      components: [],
      headers: [
        {
          text: "TITLE",
          align: "center",
          sortable: true,
          value: "title",
        },
        {
          text: "TYPE",
          align: "center",
          sortable: true,
          value: "type",
        },
        {
          text: "TAGS",
          align: "let",
          sortable: true,
          value: "tags",
        },
        {
          text: "OWNER",
          align: "center",
          sortable: true,
          value: "owner",
        },
        {
          text: "ACTIONS",
          align: "center",
          sortable: false,
          value: "actions",
        },
      ],
      addingComponent: false,
      componentTypes: [
        { text: "Basic", value: "basic", disabled: false },
        { text: "Composite", value: "composite", disabled: false },
      ],
      addComponent: {
        title: "",
        type: "",
      },
      importComponent: {
        title: "",
        file: "",
        content: "",
        invalid: false
      },
      rules: {
        required: (value) => !!value || "Required.",
        address: (v) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d/.test(v),
      },
      addComponentValid: false,
      importComponentValid: false,
      addComponentMode: 0,
      users: {},
      showUserProfile: false,
      userProfilePosition: { x: 0, y: 0 },
      selectedUser: "",
      confirmRemove: false,
      selectedComponent: undefined,
      showComponentDetails: false,
      componentDetailsPosition: { x: 0, y: 0 },
    };
    if (this.type) {
      data.fixedFilters = [
        { 
          label: this.type == "composite"? "Composite": "Basic",
          value: this.type
        }
      ];
      data.selectedFixedFilters = [`type=${this.type}`];
    }
    return data;
  },
  computed: {
    query() {
      let query = {};
      for (let f of this.selectedFixedFilters) {
        let fields = f.split("=");
        this.$util.log(fields);
        if (query[fields[0]] && Array.isArray(query[fields[0]]))
          query[fields[0]].push(fields[1]);
        else if (query[fields[0]])
          query[fields[0]] = [query[fields[0]], fields[1]];
        else query[fields[0]] = fields[1];
      }
      for (let f of this.selectedFilters) {
        let fields = f.split("=");
        if (query[fields[0]] && Array.isArray(query[fields[0]]))
          query[fields[0]].push(fields[1]);
        else if (query[fields[0]])
          query[fields[0]] = [query[fields[0]], fields[1]];
        else query[fields[0]] = fields[1];
      }
      for (let key in query) {
        query[key] = _.isArray(query[key]) ? { $in: query[key] } : query[key];
      }
      this.log(`query() = ${JSON.stringify(query)}`);
      return query;
    },
    myHeaders() {
      if (this.mode == "list") return this.headers;
      else return _.filter(this.headers, (header) => header.value != "actions");
    },
  },
  created() {
    window.page = this;
    this.refresh();
  },
  destroyed() {},
  methods: {
    log(msg) {
      this.$util.log(`[ComponentsList] ${msg}`);
    },
    async refresh() {
      this.log("refresh()");
      this.loading = true;
      try {
        let result = await this.$model.listComponents(
          this.$root.user.token,
          this.query
        );
        this.components.splice(0, this.components.length);
        _.each(result, async (component) => {
          this.components.push(component);
          component.perm = this.perm(component);
          let owner = _.find(
            component.perms,
            (perm) => perm.type == "owner" && perm.role != "0"
          );
          component.owner = owner.role;
          if (!this.users[owner.role]) {
            let [user] = await this.$model.listUsers(this.$root.user.token, {
              id: owner.role,
            });
            if (user) this.$set(this.users, owner.role, user);
          }
        });

        //Array.prototype.push.apply(this.components, result);
      } catch (err) {
        this.$root.error(err, "Unable to obtain components", 5000);
      } finally {
        this.loading = false;
      }
    },
    appendFilter(text) {
      this.log(`appendFilter(${text})`);
      if (text) {
        let filter = null;
        if (text.indexOf("=") != -1) {
          filter = { label: text, value: text };
        } else {
          filter = { label: text, value: `title=${text}` };
        }

        // check whether the filter was added before
        if (!this.filters.find((f) => f.value == filter.value)) {
          // by default the new filter is selected
          this.filters.push(filter);
          this.selectedFilters.push(filter.value);
          //this.computeFiltersHeight();
        }
        this.filterText = "";
        this.refresh();
      }
    },
    removeFilter(filter) {
      this.log(`removeFilter(${filter.value})`);
      let index = this.filters.findIndex((f) => f.value == filter.value);
      this.filters.splice(index, 1);
      index = this.selectedFilters.findIndex((f) => f.value == filter.value);
      if (index !== -1) this.selectedFilters.splice(index, 1);
      // this.computeFiltersHeight();
      this.$nextTick(() => this.refresh());
    },
    openAddComponent(component) {
      this.log("openAddComponent()");
      this.addingComponent = true;
    },
    resetAddComponent(all) {
      if (all) {
        if (this.$refs.addComponentForm) this.$refs.addComponentForm.reset();
        this.addComponent.title = "";
        this.addComponent.type = "";
        this.importComponent.title = "";
        this.importComponent.file = undefined;
        this.importComponent.content = "";
        this.importComponent.invalid = false;
      }
    },
    checkFileToImport(file) {
      if (file) return true;
      if (!file && !this.importComponent.invalid) return "Required.";
      return "Invalid file.";
    },
    changeFileToImport(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', (event) => {
        let content = event.target.result;
        try {
          content = YAML.parse(content);
        } catch(err) {
          try {
            content = JSON.parse(content);
          } catch (err) {
            content = undefined;
          }
        }
        if (content) {
          this.importComponent.invalid = false;
          this.importComponent.content = content;
          this.importComponent.title = content.name;
        } else {
          this.importComponent.invalid = true;
          this.importComponent.file = undefined;
        }
      });
      reader.readAsText(file);
    },
    async acceptAddComponent() {
      this.log("acceptAddComponent()");
      this.addingComponent = false;
      this.loading = true;
      let component = undefined;
      console.log(this.addComponentMode);
      if (this.addComponentMode == 0) {
        console.log("NEW!!");
        component = {
          type: this.addComponent.type,
          title: this.addComponent.title,
          name: this.addComponent.title,
          summary: "",
          desc: "",
          labels: [],
          model: {
            type: this.addComponent.type,
            name: this.addComponent.title,
          },
          layout: {},
          pict: "",
        };
      } else {
        if (this.importComponent.content.model) component = this.importComponent.content;
        else {
          component = {
            type: this.importComponent.content.type,
            name: this.importComponent.content.name,
            summary: "",
            desc: "",
            labels: [],
            model: this.importComponent.content,
            layout: {},
            pict: ""
          };
        }
        component.title = this.importComponent.title;
      } 

      try {
        let tx = await this.$model.addComponent(
          this.$root.user.token,
          component
        );
        await this.refresh();
      } catch (err) {
        this.$root.error(err, "Unable to add component", 5000);
      } finally {
        this.loading = false;
        this.resetAddComponent(true);
      }
    },
    cancelAddComponent() {
      this.log("cancelAddComponent()");
      this.addingComponent = false;
      this.resetAddComponent(true);
    },
    openEditComponent(component) {
      this.log("openEditComponent()");
      this.$router.push(`/components/${component.id}`);
    },
    openRemoveComponent(component) {
      this.log("openRemoveComponent()");
      this.selectedComponent = component;
      this.confirmRemove = true;
    },
    async acceptRemoveComponent() {
      this.loading = true;
      try {
        let tx = await this.$model.removeComponent(
          this.$root.user.token,
          this.selectedComponent.id
        );
        await this.refresh();
      } catch (err) {
        this.$root.error(err, "Unable to remove component", 5000);
      } finally {
        this.confirmRemove = false;
        this.loading = false;
      }
    },
    exportComponent(component) {
      this.log(`exportComponent(${JSON.stringify(component)})`);
      var element = document.createElement("a");
      element.setAttribute(
        "href",
        "data:text/plain;charset=utf-8," +
        encodeURIComponent(YAML.stringify(component))
          /*encodeURIComponent(JSON.stringify(component))*/
      );
      element.setAttribute("download", `${component.name}.component`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    },
    openDeployComponent(component) {
      this.log("openDeployComponent()");
    },
    tags(component) {
      let tags = [];
      _.each(component.labels, (label, i) => {
        if (label.startsWith("tag=")) {
          let [name, tag] = label.split("=");
          let [text, color] = tag.split(":");
          tags.push({
            id: i,
            text: text,
            color: color,
          });
        }
      });
      return tags;
    },
    showComponent(component, data) {
      this.log(`showComponent(${component.id})`);
      if (this.mode == "list") this.openEditComponent(component);
      else if (this.mode == "select") this.selectedComponent = component;
    },
    selectComponent(ev) {
      this.log(`selectComponent(${JSON.stringify(ev)})`);
      if (this.mode == "select")
        this.$emit("select", ev.value ? ev.item : null);
    },
    selectUser(ev, user) {
      this.log(`selectUser()`);
      this.selectedUser = user;
      this.userProfilePosition.x = ev.clientX;
      this.userProfilePosition.y = ev.clientY;
      this.showUserProfile = true;
    },
    perm(component) {
      this.log(`perm(${JSON.stringify(component.perms)}`);
      let type = "read";
      for (let perm of component.perms) {
        if (this.$root.user.roles.includes(perm.role)) {
          if (perm.type == "owner") {
            type = "owner";
            break;
          } else if (perm.type == "write" && type != "owner") type = "write";
        }
      }
      return type;
    },
    clickComponent(ev) {
      this.log(`clickComponent()`);
      if (this.mode == "select") {
        this.componentDetailsPosition.x = ev.clientX;
        this.componentDetailsPosition.y = ev.clientY;
        this.showComponentDetails = true;
      }
    }
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
