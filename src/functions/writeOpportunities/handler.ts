import {
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  Company,
  HubspotWebhook,
  Properties,
  WebhookEventBridgeEvent,
  WebhookEventBridgeEventSimplified,
} from "@libs/types";
import { industryHubspotToAceMappingObject } from "@libs/types";
import { Client } from "@hubspot/api-client";
import {
  AceFileOppurtunityInbound,
  companyPorpertiesNeeded,
} from "@libs/types";
import { middyfy } from "@libs/lambda";
import moment from "moment";
import axios, { AxiosRequestConfig } from "axios";
import _ from "lodash";

const s3Client = new S3Client({ region: "us-west-2" });

const writeOpprtunity = async (
  event: WebhookEventBridgeEvent
): Promise<void> => {
  console.log("event", JSON.stringify(event));

  const initProperties: Properties<string> = {
    dealname: undefined,
    closedate: undefined,
    hubspot_owner_id: undefined,
  };
  const properties = Object.entries(event.detail.properties).reduce(
    (o, key) => ({ ...o, [key[0]]: key[1].value }),
    initProperties
  );
  const simplifiedEvent: WebhookEventBridgeEventSimplified = {
    ...event,
    detail: { ...event.detail, properties },
  };

  const opportunity = await createOpportunityObject(simplifiedEvent.detail);

  console.log(opportunity);

  const input: PutObjectCommandInput = {
    Key: "opportunity-inbound/TEST_3.json",
    Bucket: process.env.BUCKET_NAME,
    Body: JSON.stringify(opportunity),
    ACL: "bucket-owner-full-control",
  };
  const putCommand = new PutObjectCommand(input);
  await s3Client.send(putCommand);

  return;
};

export const createOpportunityObject = async (
  event: HubspotWebhook<string>
): Promise<AceFileOppurtunityInbound> => {
  const hubspotClient = new Client({
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  });

  const {
    objectId: dealId,
    properties: { hubspot_owner_id },
  } = event;

  const notes = await getNotes(dealId, hubspotClient);

  const company = await getCompany(dealId, hubspotClient);

  const owner = await getOwner(hubspot_owner_id, hubspotClient);

  const opportunity = {
    version: "1",
    spmsId: "spmsId",
    opportunities: [
      {
        status: "Draft",
        customerCompanyName: company.name || event.properties.dealname,
        country: company.country,
        postalCode: company.zip,
        customerTitle: "",
        customerPhone: "",
        customerLastName: "",
        customerFirstName: "",
        customerEmail: "",
        customerWebsite: company.domain || "",
        partnerProjectTitle: event.properties.dealname,
        deliveryModel: "Managed Services",
        expectedMonthlyAwsRevenue: 100.0,
        partnerPrimaryNeedFromAws: "For Visibility - No assistance needed",
        targetCloseDate: moment(parseInt(event.properties.closedate)).format(
          "YYYY-MM-DD"
        ),
        primaryContactLastName: owner.lastName,
        primaryContactFirstName: owner.firstName,
        primaryContactEmail: owner.email,
        industry: mapIndustry(company.secteur_gics),
        projectDescription: notes,
        aWSAccountOwnerName: "TEST owner name",
        aWSAccountOwnerEmail: "test@test.com",
        awsAccountId: "111111111111",
      },
    ],
  };

  return opportunity;
};

const getCompany = async (
  dealId: string | undefined,
  hubspotClient: Client
): Promise<Company> => {
  const defaultCompany: Company = {
    secteur_gics: "",
    country: "France",
    domain: "theodo.fr",
    zip: "75017",
    name: "",
  };

  const {
    body: {
      results: [{ id: companyId }],
    },
  } = await hubspotClient.crm.deals.associationsApi.getAll(dealId, "Companies");

  const fetchedCompany = companyId
    ? (
        await hubspotClient.crm.companies.basicApi.getById(
          companyId,
          companyPorpertiesNeeded
        )
      ).body.properties
    : undefined;

  return _.defaults(fetchedCompany, defaultCompany);
};

const getNotes = async (dealId: string, hubspotClient: Client) => {
  const {
    body: { results: noteIds },
  } = await hubspotClient.crm.deals.associationsApi.getAll(dealId, "Notes");

  return (
    await Promise.all(
      noteIds.map(
        async ({ id }) =>
          await getCleanNoteBody(id, process.env.HUBSPOT_ACCESS_TOKEN)
      )
    )
  ).join("\n");
};

const getOwner = async (hubspot_owner_id: string, hubspotClient: Client) =>
  (await hubspotClient.crm.owners.ownersApi.getById(parseInt(hubspot_owner_id)))
    .body;

const mapIndustry = (secteur_gics: string) => {
  return industryHubspotToAceMappingObject[secteur_gics];
};

const getNoteById = async (id: string, hubspotToken: string) => {
  const config: AxiosRequestConfig = {
    headers: {
      authorization: `Bearer ${hubspotToken}`,
    },
    params: {
      properties: "hs_note_body",
    },
  };

  return (
    await axios.get(
      `${process.env.HUBSPOT_API_BASE_URL}/objects/notes/${id}?archived=false`,
      config
    )
  ).data;
};

const getCleanNoteBody = async (id: string, hubspotToken: string) =>
  cleanTextFromHtmlTags(
    (await getNoteById(id, hubspotToken)).properties.hs_note_body
  );

const cleanTextFromHtmlTags = (html: string) => {
  return html.replace(/<[^>]+>/g, "");
};

export const main = middyfy(writeOpprtunity);
