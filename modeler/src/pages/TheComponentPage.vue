<template>
  <div class="the-component-page" style="height: 100%; overflow: auto">
    <v-app-bar app dark>
      <v-btn icon @click="back">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title>Component {{
        (component && component.title) || ""
      }}</v-toolbar-title>
      <template v-slot:extension>
        <v-btn
          v-if="changed"
          fab
          color="primary"
          top
          right
          absolute
          @click="saveComponent"
        >
          <v-icon>mdi-content-save</v-icon>
        </v-btn>
        <v-tabs v-model="tab" align-with-title show-arrows>
          <v-tab key="details">Details</v-tab>
          <v-tab key="model">Model</v-tab>
          <v-tab v-if="appMode == 'dashboard'" key="perms">Permissions</v-tab>
        </v-tabs>
      </template>
    </v-app-bar>
    <v-tabs-items touchless v-model="tab" style="height: 100%; overflow: auto">
      <!------------------- DETAILS -------------------->
      <v-tab-item key="details">
        <v-container fluid>
          <v-toolbar flat>
            <v-btn-toggle
              class="d-none d-md-block"
              v-model="gridMode"
              mandatory
              group
              @change="layout"
            >
              <v-btn :value="1" icon><v-icon>mdi-view-list</v-icon></v-btn
              ><v-btn :value="2" icon><v-icon>mdi-view-grid</v-icon></v-btn
              ><v-btn :value="3" icon><v-icon>mdi-grid</v-icon></v-btn>
            </v-btn-toggle>
            <v-spacer></v-spacer>
            <v-menu bottom left>
              <template v-slot:activator="{ on, attrs }">
                <v-btn icon v-bind="attrs" v-on="on">
                  <v-icon>mdi-view-grid-plus</v-icon>
                </v-btn>
              </template>

              <v-list>
                <v-list-item
                  v-for="(card, i) in cards"
                  :key="i"
                  :disabled="card.state != 'closed'"
                  @click="addCard(card)"
                >
                  <v-list-item-title>{{ card.title }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </v-toolbar>

          <v-row>
            <v-col v-for="(col, i) in grid" cols="12" :key="i" :md="cols">
              <draggable v-model="grid[i]" group="cards" @start="drag=true" @end="drag=false" class="col" draggable=".item">
                <v-col
                  v-for="card in grid[i]"
                  :key="card.id"
                  cols="12"
                  class="item"
                >
                  <draggable-card
                    :title="card.title"
                    :state="card.state"
                    @maximize="card.state = 'maximized'"
                    @minimize="card.state = 'minimized'"
                    @close="closeCard(card)"
                  >
                    <component-basic
                      v-if="card.id == 'basic'"
                      :component="component"
                      @change="changeComponent"
                    ></component-basic>
                    <component-tags
                      v-if="card.id == 'tags'"
                      :component="component"
                      @change="changeComponent"
                    ></component-tags>
                    <component-variables
                      v-if="card.id == 'variables'"
                      :component="component"
                      @change="changeComponent"
                    ></component-variables>
                    <component-endpoints
                      v-if="card.id == 'endpoints'"
                      :component="component"
                      @change="changeComponent"
                    ></component-endpoints>
                    <component-volumes
                      v-if="card.id == 'volumes'"
                      :component="component"
                      @change="changeComponent"
                    ></component-volumes>
                    <component-description
                      v-if="card.id == 'description'"
                      :component="component"
                      @change="changeComponent"
                    ></component-description>
                    <component-labels
                      v-if="card.id == 'labels'"
                      :component="component"
                      @change="changeComponent"
                    ></component-labels>
                  </draggable-card>
                </v-col>
              </draggable>
            </v-col>
          </v-row>
        </v-container>
      </v-tab-item>

      <!------------------- MODEL -------------------->
      <v-tab-item
        key="model"
        style="height: 100%; min-height: 100%; max-width: 100%"
      >
        <v-container style="height: 100%; min-height: 100%; max-width: 100%">
          <component-model
            ref="model"
            :component="component"
            style="height: 100%; max-width: 100%"
            @change="changeComponent"
          ></component-model>
        </v-container>
      </v-tab-item>

      <!------------------- PERMISSIONS -------------------->
      <v-tab-item v-if="appMode == 'dashboard'" key="perms">
        <v-container>Permissions </v-container>
      </v-tab-item>
    </v-tabs-items>

    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="64"></v-progress-circular>
    </v-overlay>

    <v-dialog v-model="confirmExit" max-width="300">
      <v-card>
        <v-card-title class="text-h5"> Exit </v-card-title>
        <v-card-text>
          <p>The component has been updated.</p>
          <p>Are you sure you want to exit without saving?</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            text
            @click="
              saveComponent();
              $router.back();
            "
          >
            Save & exit
          </v-btn>
          <v-btn color="primary" text @click="confirmExit = false">
            Cancel
          </v-btn>
          <v-btn color="primary" text @click="$router.back()"> Exit </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import _ from "lodash";
import ComponentModel from "../components/ComponentModel.vue";
import draggable from "vuedraggable";
import DraggableCard from "../components/DraggableCard";
import ComponentBasic from "../components/ComponentBasic";
import ComponentTags from "../components/ComponentTags";
import ComponentVariables from "../components/ComponentVariables";
import ComponentEndpoints from "../components/ComponentEndpoints";
import ComponentVolumes from "../components/ComponentVolumes";
import ComponentDescription from "../components/ComponentDescription";
import ComponentLabels from "../components/ComponentLabels";


export default {
  name: "TheComponentPage",
  components: {
    draggable,
    DraggableCard,
    ComponentBasic,
    ComponentTags,
    ComponentModel,
    ComponentVariables,
    ComponentEndpoints,
    ComponentVolumes,
    ComponentDescription,
    ComponentLabels,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
    mode: {
      type: String,
    },
  },
  data() {
    return {
      appMode: this.$appMode,
      tab: "details",
      component: {
        id: "",
        name: "",
        title: "",
        summary: "",
        desc: "",
        tags: [],
        model: "",
        layout: "",
        pict: "",
      },
      updates: {},
      lib: [],
      loading: false,
      cards: [
        { id: "basic", title: "Basic", state: "maximized" },
        { id: "description", title: "Description", state: "maximized" },
        { id: "tags", title: "Tags", state: "maximized" },
        { id: "variables", title: "Variables", state: "maximized" },
        { id: "endpoints", title: "Endpoints", state: "maximized" },
        { id: "volumes", title: "Volumes", state: "maximized" },
        { id: "labels", title: "Labels", state: "closed" },
      ],
      grid: [],
      gridMode: 2,
      changed: false,
      confirmExit: false,
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
    cols() {
      return 12 / this.gridMode;
      /*if (this.cardsViewMode == "gridx2") return 6;
      else if (this.cardsViewMode == "gridx3") return 4;
      else return 12;*/
    },
  },
  created() {
    window.page = this;
    this.refresh();
    this.layout();
  },
  methods: {
    log(msg) {
      this.$util.log(`[TheComponentPage] ${msg}`);
    },
    /*changeMode(mode) {
      this.$util.log(`[TheComponentPage] changeMode(${mode})`);
      this.mode = mode;
    },*/
    async refresh() {
      this.log(`[TheComponentPage] refresh()`);
      this.loading = true;
      try {
        // 1.- Obtain component to show
        let [component] = await this.$model.listComponents(
          this.$root.user.token,
          {
            id: this.id,
          }
        );
        if (!component) throw Error(`Component not found`);
        for (let key in component) {
          this.$set(this.component, key, component[key]);
        }
        this.$util.log(JSON.stringify(this.component));
        // 2.- Obtain library of @core components
        //let lib = await this.$model.listComponents({})
      } catch (err) {
        this.$root.error(err, "Unable to obtain component data");
        this.$router.back();
      } finally {
        this.loading = false;
      }
    },
    layout() {
      this.log(`layout()`);

      let cards;
      if (this.grid.length) {
        // keep current order
        cards = _.reduce(this.grid, (accum, col) => accum.concat(col), []);
      } else {
        cards = _.filter(this.cards, (card) => card.state != "closed");
      }

      // clean grid
      this.grid.splice(0, this.grid.length);

      // create cols
      let cardsPerGrid = Math.ceil(cards.length / this.gridMode);
      let count = 0;
      for (let i = 0; i < this.gridMode; i++) {
        let col = [];
        while (count < cards.length && col.length < cardsPerGrid)
          col.push(cards[count++]);
        this.grid.push(col);
      }
    },
    closeCard(card) {
      this.log(`closeCard(${card.id})`);

      card.state = "closed";

      let i = 0,
        found = false;
      while (i < this.grid.length && !found) {
        let index = this.grid[i].indexOf(card);
        if (index != -1) {
          found = true;
          this.grid[i].splice(index, 1);
        }
        i++;
      }
    },
    addCard(card) {
      this.log(`addCard(${card.id})`);

      card.state = "maximized";
      this.grid[this.grid.length-1].push(card);

    },
    changeComponent(updates) {
      this.$util.log(`changeComponent()`);
      for (let key in updates) {
        this.component[key] = this.updates[key] = updates[key];
      }
      this.changed = true;
    },
    async saveComponent() {
      this.$util.log(`[TheComponentPage] saveComponent()`);

      try {
        await this.$model.updateComponent(
          this.$root.user.token,
          this.component.id,
          this.updates
        );
        this.changed = false;
      } catch (err) {
        this.$root.error(`Unable to update component`, 5000);
      }
      // Get component model
      //let model = this.$refs.model.exportComponentModel();
      // [TODO] Update component properties

      // [TODO] Update info in database

      /*this.mode = "read";*/
    },
    back() {
      if (this.changed) {
        this.confirmExit = true;
      } else this.$router.back();
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
/*.the-component-page,
.v-tabs-items,
.v-window-item {
  height: 100%;
}*/
</style>
