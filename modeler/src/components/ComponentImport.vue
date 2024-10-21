<template>
  <!--v-row justify="center">
    <v-dialog v-model="showDialog" scrollable max-width="800">
      <v-stepper v-model="step">
        <v-stepper-header>
          <v-stepper-step :complete="step > 1" step="1" color="black">
            Choose import source
          </v-stepper-step>
          <v-divider></v-divider>
          <v-stepper-step :complete="step > 2" step="2" color="black">
            Select component
          </v-stepper-step>
          <v-divider></v-divider>
          <v-stepper-step step="3" color="black">
            Confirm import
          </v-stepper-step>
        </v-stepper-header>

        <! Step 1: Select import method >
        <v-card v-if="step == 1">
          <v-card-text>
            <v-container>
              <v-row justify="center">
                <v-spacer></v-spacer>
                <v-col
                  ><v-btn dark @click="selectMode('library')"
                    >From library
                  </v-btn></v-col
                >
                <v-spacer></v-spacer>
              </v-row>
              <v-row align="center">
                <v-spacer></v-spacer>
                <v-col
                  ><v-btn dark @click="selectMode('url')">
                    From URL
                  </v-btn></v-col
                >
                <v-spacer></v-spacer>
              </v-row>
              <v-row align="center">
                <v-spacer></v-spacer>
                <v-col
                  ><v-btn dark @click="selectMode('file')">
                    From file
                  </v-btn></v-col
                >
                <v-spacer></v-spacer>
              </v-row>
            </v-container>
          </v-card-text>
           <v-divider></v-divider>
          <v-card-actions>
            <v-btn v-if="step > 1" text @click="doBack"
              ><v-icon>mdi-arrow-left</v-icon>Back</v-btn
            >
            <v-btn text @click="doCancel"> Cancel </v-btn>
            <v-btn v-if="step == 3" dark @click="doAccept"> Confirm </v-btn>
          </v-card-actions>
        </v-card>

        < Step 2: Select component >
        <v-card
          v-if="step == 2"
          style="
            height: 100%;
            padding-bottom: 72px;
            display: flex;
            flex-direction: column;
          "
        >
          <v-card-title>
            <search-bar
              v-if="step == 2 && selectedMode == 'library'"
              :fixedFilters="fixedFilters"
              :selectedFixedFilters="selectedFixedFilters"
              @change="doSearch"
            ></search-bar>
          </v-card-title>
          <v-divider></v-divider>
          <v-card-text style="overflow: auto">
            < Step 2: Select component >
            <v-container>
              <components-list
                v-if="selectedMode == 'library'"
                :query="query"
                @selected="doSelect"
              ></components-list>
            </v-container>
          </v-card-text>

          <v-divider></v-divider>
          <v-card-actions>
            <v-btn v-if="step > 1" text @click="doBack"
              ><v-icon>mdi-arrow-left</v-icon>Back</v-btn
            >
            <v-btn text @click="doCancel"> Cancel </v-btn>
            <v-btn v-if="step == 3" dark @click="doAccept"> Confirm </v-btn>
          </v-card-actions>
        </v-card>

        <! Step 3: Confirm selection >
        <v-card v-if="step == 3" style="
            height: 100%;
            padding-bottom: 72px;
            display: flex;
            flex-direction: column;
          ">
          <v-card-text style="overflow: auto">
            <v-container>
              <component-details :component="component"></component-details>
            </v-container>
          </v-card-text>
           <v-divider></v-divider>
          <v-card-actions>
            <v-btn v-if="step > 1" text @click="doBack"
              ><v-icon>mdi-arrow-left</v-icon>Back</v-btn
            >
            <v-btn text @click="doCancel"> Cancel </v-btn>
            <v-btn v-if="step == 3" dark @click="doAccept"> Confirm </v-btn>
          </v-card-actions>
        </v-card>
      </v-stepper>
    </v-dialog>
  </v-row-->
  <v-card>
    <v-card-title>
      <span class="text-h5">Import Component</span>
    </v-card-title>
    <v-card-text>
      <v-container>
        <v-form ref="importComponentForm" v-model="valid">
          <v-row>
            <v-col cols="12">
              <v-select
                :items="importModes"
                label="Import from*"
                :rules="[rules.required]"
                required
                v-model="selectedMode"
                @change="reset(false)"
              ></v-select>
            </v-col>
            <!--v-col cols="12">
              <v-text-field
                label="Title*"
                :rules="[rules.required]"
                required
                v-model="addDomain.title"
              ></v-text-field>
            </v-col>
          </v-row-->

            <v-row v-if="selectedMode == 'library'">
              <v-col cols="12">
                <components-list
                  mode="select"
                  @select="selectComponent"
                ></components-list>
              </v-col>
            </v-row>

            <!---------------- Import from library  -------------->
            <!--v-row v-if="addDomain.type == 'kind/k8s'">
            <v-col cols="12">
              <v-text-field
                clearable
                label="Host address*"
                :rules="[rules.required, rules.address]"
                hint="Host where the cluster will be created"
                required
                v-model="addDomain.hostAddr"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                clearable
                label="SSH user*"
                :rules="[rules.required]"
                required
                v-model="addDomain.hostUser"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                clearable
                type="password"
                label="SSH password"
                :rules="[passwordOrKey]"
                v-model="addDomain.hostPassword"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="4" align-self="center" justify="center">
              <v-btn small @click="openPrivateKey">Set SSH private key</v-btn>
              <input
                id="filePrivateKey"
                @change="savePrivateKey"
                type="file"
                style="display: none"
              />
            </v-col>
            <v-col v-if="addDomain.hostPrivateKey" cols="12" md="8">
              <v-textarea
                outlined
                label="Private key"
                :value="addDomain.hostPrivateKey"
                no-resize
                rows="2"
              ></v-textarea>
            </v-col>
          </v-row-->

            <!---------------- external/k8s  -------------->
            <!--v-row v-if="addDomain.type == 'external/k8s'">
            <v-col cols="12" md="4" align-self="center" justify="end">
              <v-btn small @click="openKubeConfig">Set Kubeconfig*</v-btn>
              <input
                id="fileKubeConfig"
                @change="saveKubeConfig"
                type="file"
                style="display: none"
              />
            </v-col>
            <v-col cols="12" md="8">
              <v-textarea
                outlined
                label="Kubeconfig"
                :rules="[rules.required]"
                :value="addDomain.kubeconfig"
                no-resize
                rows="2"
              ></v-textarea>
            </v-col-->
          </v-row>
        </v-form>
      </v-container>
      <small>*Required field</small>
    </v-card-text>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn color="blue darken-1" text @click="cancel"> Cancel </v-btn>
      <v-btn
        :disabled="!valid || !selectedComponent"
        color="blue darken-1"
        text
        @click="accept"
      >
        Accept
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
<script>
import ComponentsList from "./ComponentsList";
//import SearchBar from "@/components/SearchBar";
//import ComponentDetails from "@/components/ComponentDetails";

export default {
  name: "ComponentImport",
  components: {
    ComponentsList,
    /*ComponentDetails,
    SearchBar,*/
  },
  props: {
    mode: {
      type: String,
    },
  },
  data() {
    return {
      valid: false,
      importModes: [
        { text: "Library", value: "library", disabled: false },
        { text: "File", value: "file", disabled: true },
        { text: "URL", value: "url", disabled: true },
      ],
      rules: {
        required: (value) => !!value || "Required.",
        address: (v) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(v),
        //address: (v) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d/.test(v),
      },
      selectedMode: "",
      selectedComponent: null,

      /*
      currentMode: "library",
      showDialog: true,
      step: 1,
      filters: [],
      fixedFilters: [
        { label: "Composite", value: "type=composite" },
        { label: "Basic", value: "type=basic" },
      ],
      selectedFixedFilters: ["type=composite", "type=basic"],
      component: null,*/
    };
  },
  computed: {
    /*selectedMode() {
      return this.mode || this.currentMode;
    },
    query() {
      let query = {};
      for (let f of this.filters) {
        let fields = f.split("=");
        this.$util.log(fields);
        if (query[fields[0]] && Array.isArray(query[fields[0]]))
          query[fields[0]].push(fields[1]);
        else if (query[fields[0]])
          query[fields[0]] = [query[fields[0]], fields[1]];
        else query[fields[0]] = fields[1];
      }
      this.$util.log(`[ComponentImport] query() = ${JSON.stringify(query)}`);
      return query;
    },*/
  },
  created() {},
  destroyed() {},
  methods: {
    log(msg) {
      this.$util.log(`[ComponentImport] ${msg}`);
    },
    reset() {
      this.log("reset()");
    },
    accept() {
      this.log(`accept()`);
      this.$emit("action", {
        type: "accept",
        component: this.selectedComponent,
      });
    },
    cancel() {
      this.log(`cancel()`);
      this.$emit("action", { type: "cancel" });
    },
    selectComponent(component) {
      this.log(`selectComponent(${component && component.id})`);
      this.selectedComponent = component;
    },

    /*selectMode(mode) {
      this.$util.log(`[ComponentImport] selectMode(${mode})`);
      this.currentMode = mode;
      this.step = 2;
    },
    doSearch(filters) {
      this.$util.log(`[ComponentImport] doSearch(${filters})`);
      this.filters = filters;
    },
    doSelect(component) {
      this.$util.log(`[ComponentImport] selected(${JSON.stringify(component)})`);
      this.component = component;
      this.step = 3;
    },
    doAccept() {
      this.$util.log(`[ComponentImport] doAccept()`);
      this.$emit("action", { type: "accept", component: this.component });
    },
    doCancel() {
      this.$util.log(`[ComponentImport] doCancel()`);
      this.$emit("action", { type: "cancel" });
    },
    doBack() {
      this.$util.log(`[ComponentImport] doBack()`);
      this.step--;
    },*/
  },
};
</script>
<style scoped>
</style>