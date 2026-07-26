/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import APBills from './pages/APBills';
import Admissions from './pages/Admissions';
import AssetAssignments from './pages/AssetAssignments';
import AssetRentals from './pages/AssetRentals';
import Assets from './pages/Assets';
import Attendance from './pages/Attendance';
import AttendanceDevices from './pages/AttendanceDevices';
import AuditLogs from './pages/AuditLogs';
import BankFileTemplates from './pages/BankFileTemplates';
import BankManagement from './pages/BankManagement';
import Branches from './pages/Branches';
import CMS from './pages/CMS';
import CRM from './pages/CRM';
import ChartOfAccounts from './pages/ChartOfAccounts';
import ChequeManagement from './pages/ChequeManagement';
import Collections from './pages/Collections';
import Communications from './pages/Communications';
import Companies from './pages/Companies';
import BusinessTravel from './pages/BusinessTravel';
import ContractTemplates from './pages/ContractTemplates';
import CorporateCards from './pages/CorporateCards';
import Contracts from './pages/Contracts';
import CostCenters from './pages/CostCenters';
import Dashboard from './pages/Dashboard';
import Depreciation from './pages/Depreciation';
import DisciplinaryCases from './pages/DisciplinaryCases';
import EOSBCalculator from './pages/EOSBCalculator';
import ExecutiveCommandCenter from './pages/ExecutiveCommandCenter';
import ESSPortal from './pages/ESSPortal';
import ESSSettings from './pages/ESSSettings';
import EmployeeAttendance from './pages/EmployeeAttendance';
import Engagement from './pages/Engagement';
import Employees from './pages/Employees';
import Expenses from './pages/Expenses';
import Facilities from './pages/Facilities';
import Fees from './pages/Fees';
import FiscalPeriods from './pages/FiscalPeriods';
import FleetManagement from './pages/FleetManagement';
import GeneralLedger from './pages/GeneralLedger';
import GovIntegrations from './pages/GovIntegrations';
import GovernmentRelations from './pages/GovernmentRelations';
import GradeConfiguration from './pages/GradeConfiguration';
import HRApprovalsInbox from './pages/HRApprovalsInbox';
import HRContracts from './pages/HRContracts';
import HRPoliciesLibrary from './pages/HRPoliciesLibrary';
import HolidayCalendar from './pages/HolidayCalendar';
import ITHelpdesk from './pages/ITHelpdesk';
import Integrations from './pages/Integrations';
import InvoiceDetails from './pages/InvoiceDetails';
import JournalEntries from './pages/JournalEntries';
import LeaveBalances from './pages/LeaveBalances';
import Leaves from './pages/Leaves';
import MyPayslips from './pages/MyPayslips';
import NotificationCenter from './pages/NotificationCenter';
import NotificationPreferences from './pages/NotificationPreferences';
import NotificationSettings from './pages/NotificationSettings';
import Onboarding from './pages/Onboarding';
import OperationsDashboard from './pages/OperationsDashboard';
import Overtime from './pages/Overtime';
import ParentIntake from './pages/ParentIntake';
import ParentIntakeManagement from './pages/ParentIntakeManagement';
import ParentPortal from './pages/ParentPortal';
import Payroll from './pages/Payroll';
import PayslipsManagementPage from './pages/PayslipsManagementPage';
import PerformanceEvaluation from './pages/PerformanceEvaluation';
import PlatformConsole from './pages/PlatformConsole';
import PolicyEditor from './pages/PolicyEditor';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseRequisitions from './pages/PurchaseRequisitions';
import Reconciliation from './pages/Reconciliation';
import RecruitmentPage from './pages/RecruitmentPage';
import Refunds from './pages/Refunds';
import Reports from './pages/Reports';
import RoleManagement from './pages/RoleManagement';
import RolesPermissions from './pages/RolesPermissions';
import Settings from './pages/Settings';
import StaffInbox from './pages/StaffInbox';
import StudentAttendancePage from './pages/StudentAttendancePage';
import StudentTags from './pages/StudentTags';
import Students from './pages/Students';
import TicketDetails from './pages/TicketDetails';
import TrainingDevelopment from './pages/TrainingDevelopment';
import TuitionFeesConfiguration from './pages/TuitionFeesConfiguration';
import UserManagement from './pages/UserManagement';
import VATManagement from './pages/VATManagement';
import Vendors from './pages/Vendors';
import WorkflowEngine from './pages/WorkflowEngine';
import WorkforcePlanning from './pages/WorkforcePlanning';
import YamenAI from './pages/YamenAI';
import YamenCollections from './pages/YamenCollections';
import SchoolClinic from './pages/SchoolClinic';
import LibraryManagement from './pages/LibraryManagement';
import CanteenManagement from './pages/CanteenManagement';
import TransportManagement from './pages/TransportManagement';
import __Layout from './Layout.jsx';


export const PAGES = {
    "APBills": APBills,
    "Admissions": Admissions,
    "AssetAssignments": AssetAssignments,
    "AssetRentals": AssetRentals,
    "Assets": Assets,
    "Attendance": Attendance,
    "AttendanceDevices": AttendanceDevices,
    "AuditLogs": AuditLogs,
    "BankFileTemplates": BankFileTemplates,
    "BankManagement": BankManagement,
    "Branches": Branches,
    "CMS": CMS,
    "CRM": CRM,
    "ChartOfAccounts": ChartOfAccounts,
    "ChequeManagement": ChequeManagement,
    "Collections": Collections,
    "Communications": Communications,
    "Companies": Companies,
    "BusinessTravel": BusinessTravel,
    "ContractTemplates": ContractTemplates,
    "CorporateCards": CorporateCards,
    "Contracts": Contracts,
    "CostCenters": CostCenters,
    "Dashboard": Dashboard,
    "Depreciation": Depreciation,
    "DisciplinaryCases": DisciplinaryCases,
    "EOSBCalculator": EOSBCalculator,
    "ExecutiveCommandCenter": ExecutiveCommandCenter,
    "ESSPortal": ESSPortal,
    "ESSSettings": ESSSettings,
    "EmployeeAttendance": EmployeeAttendance,
    "Engagement": Engagement,
    "Employees": Employees,
    "Expenses": Expenses,
    "Facilities": Facilities,
    "Fees": Fees,
    "FiscalPeriods": FiscalPeriods,
    "FleetManagement": FleetManagement,
    "GeneralLedger": GeneralLedger,
    "GovIntegrations": GovIntegrations,
    "GovernmentRelations": GovernmentRelations,
    "GradeConfiguration": GradeConfiguration,
    "HRApprovalsInbox": HRApprovalsInbox,
    "HRContracts": HRContracts,
    "HRPoliciesLibrary": HRPoliciesLibrary,
    "HolidayCalendar": HolidayCalendar,
    "ITHelpdesk": ITHelpdesk,
    "Integrations": Integrations,
    "InvoiceDetails": InvoiceDetails,
    "JournalEntries": JournalEntries,
    "LeaveBalances": LeaveBalances,
    "Leaves": Leaves,
    "MyPayslips": MyPayslips,
    "NotificationCenter": NotificationCenter,
    "NotificationPreferences": NotificationPreferences,
    "NotificationSettings": NotificationSettings,
    "Onboarding": Onboarding,
    "OperationsDashboard": OperationsDashboard,
    "Overtime": Overtime,
    "ParentIntake": ParentIntake,
    "ParentIntakeManagement": ParentIntakeManagement,
    "ParentPortal": ParentPortal,
    "Payroll": Payroll,
    "PayslipsManagementPage": PayslipsManagementPage,
    "PerformanceEvaluation": PerformanceEvaluation,
    "PlatformConsole": PlatformConsole,
    "PolicyEditor": PolicyEditor,
    "PurchaseOrders": PurchaseOrders,
    "PurchaseRequisitions": PurchaseRequisitions,
    "Reconciliation": Reconciliation,
    "RecruitmentPage": RecruitmentPage,
    "Refunds": Refunds,
    "Reports": Reports,
    "RoleManagement": RoleManagement,
    "RolesPermissions": RolesPermissions,
    "Settings": Settings,
    "StaffInbox": StaffInbox,
    "StudentAttendancePage": StudentAttendancePage,
    "StudentTags": StudentTags,
    "Students": Students,
    "TicketDetails": TicketDetails,
    "TrainingDevelopment": TrainingDevelopment,
    "TuitionFeesConfiguration": TuitionFeesConfiguration,
    "UserManagement": UserManagement,
    "VATManagement": VATManagement,
    "Vendors": Vendors,
    "WorkflowEngine": WorkflowEngine,
    "WorkforcePlanning": WorkforcePlanning,
    "YamenAI": YamenAI,
    "YamenCollections": YamenCollections,
    "SchoolClinic": SchoolClinic,
    "LibraryManagement": LibraryManagement,
    "CanteenManagement": CanteenManagement,
    "TransportManagement": TransportManagement,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};