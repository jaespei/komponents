<template>
  <div class="deployment-add">
    <v-stepper v-model="step" flat outlined>
      <v-stepper-header>
        <v-stepper-step :complete="step > 1" step="1">
          Select component
        </v-stepper-step>
        <v-divider></v-divider>
        <v-stepper-step :complete="step > 2" step="2">
          Deployment details
        </v-stepper-step>
        <v-divider></v-divider>
        <v-stepper-step step="3"> Target domain/s </v-stepper-step>
      </v-stepper-header>

      <v-stepper-items>
        <v-stepper-content step="1">
          <components-list
            mode="select"
            type="composite"
            @select="selectComponent"
          ></components-list>
          <v-btn :disabled="!selectedComponent" color="primary" @click="step++">
            Continue
          </v-btn>
          <v-btn text @click="cancel"> Cancel </v-btn>
        </v-stepper-content>

        <v-stepper-content step="2">
          <v-form
            ref="deploymentForm"
            v-model="valid"
            style="margin-bottom: 20px"
          >
            <v-row style="margin-bottom: 20px">
              <v-col cols="12">
                <v-text-field
                  label="Title*"
                  v-model="deployment.title"
                  :rules="[rules.required]"
                  required
                ></v-text-field>
              </v-col>

              <v-col cols="12">
                <v-expansion-panels multiple popout>
                  <v-expansion-panel v-if="deployment.variables.length">
                    <v-expansion-panel-header>
                      Variables
                    </v-expansion-panel-header>
                    <v-expansion-panel-content>
                      <v-row
                        v-for="variable in deployment.variables"
                        :key="variable.name"
                      >
                        <v-col cols="6">
                          <v-text-field
                            label="Name"
                            readonly
                            v-model="variable.name"
                          ></v-text-field>
                        </v-col>
                        <v-col cols="6">
                          <v-text-field
                            label="Value"
                            v-model="variable.value"
                          ></v-text-field>
                        </v-col>
                      </v-row>
                    </v-expansion-panel-content>
                  </v-expansion-panel>
                  <v-expansion-panel v-if="deployment.endpoints.length">
                    <v-expansion-panel-header>
                      Entrypoints
                    </v-expansion-panel-header>
                    <v-expansion-panel-content>
                      <v-row v-for="ep in deployment.endpoints" :key="ep.name">
                        <v-col cols="3">
                          <v-switch
                            label="Publish"
                            v-model="ep.publish"
                            color="blue"
                            value="blue"
                            hide-details
                            @change="ep.path = ''"
                          ></v-switch>
                        </v-col>
                        <v-col cols="3">
                          <v-text-field
                            label="Name"
                            readonly
                            v-model="ep.name"
                          ></v-text-field>
                        </v-col>
                        <v-col cols="3">
                          <v-select
                            :items="protocols"
                            label="Protocol"
                            :readonly="!ep.publish"
                            v-model="ep.protocol"
                          ></v-select>
                          <v-text-field
                            v-if="ep.protocol == 'tcp'"
                            label="Port"
                            :readonly="!ep.publish"
                            v-model="ep.port"
                          ></v-text-field>
                        </v-col>
                        <v-col cols="3">
                          <v-text-field
                            v-if="
                              ep.publish &&
                              (ep.protocol == 'http' || ep.protocol == 'https')
                            "
                            label="Path"
                            prefix="/"
                            v-model="ep.path"
                          ></v-text-field>
                        </v-col>
                      </v-row>
                    </v-expansion-panel-content>
                  </v-expansion-panel>
                </v-expansion-panels>
              </v-col>
            </v-row>
            <small>*Required field</small>
          </v-form>

          <v-btn text @click="step--"> Back </v-btn>
          <v-btn :disabled="!valid" color="primary" @click="step++">
            Continue
          </v-btn>
          <v-btn text @click="cancel"> Cancel </v-btn>
        </v-stepper-content>

        <v-stepper-content step="3">
          <domains-list
            mode="multiselect"
            @select="selectDomains"
          ></domains-list>

          <v-btn text @click="step--"> Back </v-btn>
          <v-btn
            :disabled="selectedDomains.length == 0"
            color="primary"
            @click="accept"
          >
            Finish
          </v-btn>
          <v-btn text @click="cancel"> Cancel </v-btn>
        </v-stepper-content>
      </v-stepper-items>
    </v-stepper>
  </div>
</template>
<script>
import _ from "lodash";
import ComponentsList from "@/components/ComponentsList";
import DomainsList from "@/components/DomainsList";

export default {
  name: "DeploymentAdd",
  components: {
    ComponentsList,
    DomainsList,
  },
  props: {
    component: {
      type: Object,
    },
    domains: {
      type: Array,
    },
  },
  data() {
    return {
      step: 1,
      selectedComponent: this.component,
      selectedDomains: this.domains || [],
      rules: {
        required: (value) => !!value || "Required",
      },
      protocols: [
        { text: "HTTP", value: "http" },
        { text: "TCP", value: "tcp" },
      ],
      deployment: {
        title: "",
        variables: [],
        endpoints: [],
        volumes: [],
      },
      valid: false,
    };
  },
  created() {
    window.dlg = this;
  },
  methods: {
    log(msg) {
      this.$util.log(`[DeploymentAdd] ${msg}`);
    },
    selectComponent(component) {
      this.log(`selectComponent(${component && component.id})`);
      this.selectedComponent = component;

      // clean vars
      this.deployment.variables.splice(0, this.deployment.variables.length);
      // push vars
      _.each(this.selectedComponent.model.variables, (varValue, varName) => {
        this.deployment.variables.push({
          name: varName,
          value: varValue,
        });
      });

      // clean endpoints
      this.deployment.endpoints.splice(0, this.deployment.endpoints.length);
      // push endpoints
      _.each(this.selectedComponent.model.endpoints, (ep, epName) => {
        if (ep.type == "in") {
          let [protocol, port] = ep.protocol.split(":");
          this.deployment.endpoints.push({
            name: epName,
            protocol: protocol,
            port: port,
            path: "",
          });
        }
      });

      // clean volumes
      this.deployment.volumes.splice(0, this.deployment.volumes.length);
      // push endpoints
      _.each(this.selectedComponent.model.volumes, (vol, volName) => {
        this.deployment.volumes.push({
          name: volName,
          durability: vol.durability,
          url: vol.url,
        });
      });
    },
    selectDomains(domains) {
      this.log(JSON.stringify(domains));
      this.selectedDomains.splice(0, this.selectedDomains.length);
      Array.prototype.push.apply(this.selectedDomains, domains);
    },
    cancel() {
      this.$emit("cancel");
    },
    accept() {
      this.log(`addDeployment()`);
      let event = {
        component: this.selectedComponent,
        domains: this.selectedDomains,
        deployment: {
          title: this.deployment.title,
          variables: {},
          entrypoints: {},
          volumes: {},
          domains: _.map(this.selectedDomains, dom => dom.id)
        },
      };
      _.each(this.deployment.variables, (variable) => {
        if (variable.value)
          event.deployment.variables[variable.name] = variable.value;
      });
      _.each(this.deployment.endpoints, (ep) => {
        if (ep.publish) {
          event.deployment.entrypoints[ep.name] = {
            mapping: ep.name,
            protocol: ep.protocol,
            path: `/${ep.path}`,
          };
        }
      });
      // [TODO volumes??]

      this.$emit("accept", event);
    },
  },
};
</script>

<style scoped>
</style>

