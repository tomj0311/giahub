from spiffworkflow.dmn.specs import BusinessRuleTaskMixin
from spiffworkflow.bpmn.specs.mixins import BpmnSpecMixin

class BusinessRuleTask(BusinessRuleTaskMixin, BpmnSpecMixin):
    pass