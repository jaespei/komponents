<template>
  <div class="the-deployment-page" style="height: 100%; overflow: auto">
    <v-app-bar app dark>
      <v-btn icon @click="back">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title
        >Deployment
        {{ (deployment && deployment.title) || "" }}</v-toolbar-title
      >
      <template v-slot:extension>
        <v-btn
          v-if="changed"
          fab
          color="primary"
          top
          right
          absolute
          @click="saveDeployment"
        >
          <v-icon>mdi-content-save</v-icon>
        </v-btn>
        <v-tabs v-model="tab" align-with-title show-arrows>
          <!--v-tabs-slider color="white"></v-tabs-slider-->
          <v-tab key="details">Details</v-tab>
          <v-tab key="model">Model</v-tab>
          <v-tab key="perms">Permissions</v-tab>
        </v-tabs>
      </template>
    </v-app-bar>

    <v-tabs-items touchless v-model="tab" style="width: 100%; height: 100%;">
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
              <draggable
                v-model="grid[i]"
                group="cards"
                @start="drag = true"
                @end="drag = false"
                class="col"
                draggable=".item"
              >
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
                    <deployment-basic
                      v-if="card.id == 'basic'"
                      :deployment="deployment"
                      @change="changeDeployment"
                    ></deployment-basic>
                    <deployment-entrypoints
                      v-if="card.id == 'entrypoints'"
                      :deployment="deployment"
                      @change="changeDeployment"
                    ></deployment-entrypoints>
                    <deployment-labels
                      v-if="card.id == 'labels'"
                      :deployment="deployment"
                      @change="changeDeployment"
                    ></deployment-labels>
                  </draggable-card>
                </v-col>
              </draggable>
            </v-col>
          </v-row>
        </v-container>
      </v-tab-item>
      <v-tab-item key="resources" style="width: 100%; height: 100%;">
        <!------------------- MODEL -------------------->
        <v-container fluid style="width: 100%; height: 100%;">
          <deployment-model :deployment="deployment"></deployment-model>
        </v-container>
      </v-tab-item>
      <v-tab-item key="perms">
        <!------------------- PERMISSIONS -------------------->
        <v-container fluid> Permissions </v-container>
      </v-tab-item>
    </v-tabs-items>

    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="64"></v-progress-circular>
    </v-overlay>

    <v-dialog v-model="confirmExit" max-width="300">
      <v-card>
        <v-card-title class="text-h5"> Exit </v-card-title>
        <v-card-text>
          <p>The deployment has been updated.</p>
          <p>Are you sure you want to exit without saving?</p>
        </v-card-text>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            text
            @click="
              savDeployment();
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
import draggable from "vuedraggable";
import DraggableCard from "@/components/DraggableCard";
import DeploymentBasic from "@/components/DeploymentBasic";
import DeploymentEntrypoints from "@/components/DeploymentEntrypoints";
import DeploymentLabels from "@/components/DeploymentLabels";
import DeploymentModel from "@/components/DeploymentModel";

/*import DomainConnectivity from "@/components/DomainConnectivity";
import DomainConfig from "@/components/DomainConfig";
import DomainLabels from "@/components/DomainLabels";*/

export default {
  name: "TheDeploymentPage",
  components: {
    draggable,
    DraggableCard,
    DeploymentBasic,
    DeploymentEntrypoints,
    DeploymentLabels,
    DeploymentModel,
    /*DomainBasic,
    DomainConnectivity,
    DomainConfig,
    DomainLabels*/
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      tab: "details",
      deployment: {},
      updates: {},
      loading: false,
      cards: [
        { id: "basic", title: "Basic", state: "maximized" },
        { id: "labels", title: "Labels", state: "minimized" },
        { id: "entrypoints", title: "Entrypoints", state: "maximized" },
        /*{ id: "connectivity", title: "Connectivity", state: "maximized" },
        { id: "config", title: "Configuration", state: "minimized" },
        { id: "labels", title: "Labels", state: "minimized" },*/
      ],
      grid: [],
      gridMode: 2,
      changed: false,
      confirmExit: false,
    };
  },
  computed: {
    cols() {
      return 12 / this.gridMode;
    },
  },
  created() {
    this.refresh();
    this.layout();
  },
  methods: {
    log(msg) {
      this.$util.log(`[TheDeploymentPage] ${msg}`);
    },
    async refresh() {
      this.loading = true;
      try {
        let [deployment] = await this.$model.listDeployments(
          this.$root.user.token,
          {
            id: this.id,
          }
        );
        if (!deployment) throw Error(`Deployment not found`);
        for (let key in deployment) {
          this.$set(this.deployment, key, deployment[key]);
        }
        console.log(JSON.stringify(this.deployment));
      } catch (err) {
        this.$root.error(err, "Unable to obtain deployment data");
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
      this.grid[this.grid.length - 1].push(card);
    },
    changeDeployment(updates) {
      this.$util.log(`changeDeployment()`);
      for (let key in updates) {
        this.deployment[key] = this.updates[key] = updates[key];
      }
      this.changed = true;
    },
    back() {
      if (this.changed) {
        this.confirmExit = true;
      } else this.$router.back();
    },
    async saveDeployment() {
      try {
        await this.$model.updateDeployment(
          this.$root.user.token,
          this.deployment.id,
          this.updates
        );
        this.changed = false;
      } catch (err) {
        this.log(err.stack);
        this.$root.error(`Unable to update deployment`, 5000);
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.the-deployment-page {
  overflow: auto;
}
</style>
