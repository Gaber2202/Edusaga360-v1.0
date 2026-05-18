import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ContractSignaturePage from '../components/contracts/ContractSignaturePage';

export default function ParentSignContract() {
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get('id');

  return <ContractSignaturePage contractId={contractId} />;
}